#!/usr/bin/env python3
"""Сборка офлайн-словаря для приложения (английский → русский, значения, тезаурус, примеры).

Источники (все открытые):
  * Wiktionary через kaikki.org (wiktextract): определения, IPA, примеры, связи слов,
    переводы на русский по значениям, обратный индекс RU→EN.  CC BY-SA
  * wordfreq: частотность (Zipf) — выбор слов и ранжирование подсказок.  CC BY-SA
  * Tatoeba: пары предложений EN↔RU для примеров.  CC BY 2.0 FR

Выход — шардированные JSON в public/data (грузятся приложением через fetch из ресурсов APK):
  meta.json          сведения о сборке
  words.txt          «слово \\t zipf*10» (отсортирован) — поиск по префиксу и исправление опечаток
  rwords.txt         «русский термин \\t оценка [\\t написание с ё]» — подсказки для русского ввода
  e/NNN.json         статьи: { слово: статья }
  r/NNN.json         обратный индекс: { русский термин: [английские слова] }
  s/NNN.json         предложения: { слово: [[en, ru], ...] }

Запуск:
  python3 scripts/build_data.py --download                 # полная сборка (качает ~3 ГБ, 15–30 мин)
  python3 scripts/build_data.py --sample                   # крошечный образец для разработки и тестов
  python3 scripts/build_data.py --kaikki f.jsonl[.gz] --tatoeba-eng e.tsv.bz2 \\
        --tatoeba-rus r.tsv.bz2 --tatoeba-links links.tar.bz2
"""
from __future__ import annotations

import argparse
import bz2
import gzip
import io
import json
import re
import shutil
import sys
import tarfile
import time
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Any, Callable, Iterable, Iterator

SCHEMA = 1
SHARDS_E = 512
SHARDS_R = 128
SHARDS_S = 256

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = Path(__file__).resolve().parent / "sample"

# Первый доступный адрес используется; можно переопределить флагами.
KAIKKI_URLS = [
    "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl",
    "https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz",
]
TATOEBA_ENG = "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2"
TATOEBA_RUS = "https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences.tsv.bz2"
TATOEBA_LINKS = "https://downloads.tatoeba.org/exports/links.tar.bz2"

# ───────────────────────── Общие функции ─────────────────────────


def fnv1a(text: str) -> int:
    """FNV-1a 32 бит по UTF-8 — должен совпадать с src/lib/hash.ts."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard_of(key: str, count: int) -> int:
    return fnv1a(key) % count


_SPACE = re.compile(r"\s+")
_EDGE = re.compile(r"^[\s\"'“”«»(\[]+|[\s\"'“”«»)\].,;:!?]+$")


def norm_en(text: str) -> str:
    """Ключ английского слова — как normalizeEn() в приложении."""
    t = unicodedata.normalize("NFC", text).replace("‘", "'").replace("’", "'")
    t = _SPACE.sub(" ", t).strip()
    t = _EDGE.sub("", t)
    return t.lower()


def norm_ru(text: str) -> str:
    """Ключ русского термина — как normalizeRu(): без ударений, ё→е, нижний регистр."""
    t = unicodedata.normalize("NFC", text).replace("́", "").replace("̀", "")
    t = _SPACE.sub(" ", t).strip()
    t = _EDGE.sub("", t)
    return t.lower().replace("ё", "е")


def log(*args: Any) -> None:
    print(*args, file=sys.stderr, flush=True)


def open_text(path: Path) -> IO[str]:
    name = path.name.lower()
    if name.endswith(".bz2"):
        return io.TextIOWrapper(bz2.open(path, "rb"), encoding="utf-8", errors="replace")
    if name.endswith(".gz"):
        return io.TextIOWrapper(gzip.open(path, "rb"), encoding="utf-8", errors="replace")
    return open(path, "r", encoding="utf-8", errors="replace")


def download(url: str, dest: Path, retries: int = 3) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        log(f"  кэш: {dest.name}")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            log(f"  загрузка {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "datalaw_lexa-data-build/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp, open(tmp, "wb") as out:
                total = int(resp.headers.get("Content-Length") or 0)
                done = 0
                mark = 0
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
                    done += len(chunk)
                    if done - mark >= 200 << 20:
                        mark = done
                        log(f"    {done >> 20} МБ" + (f" / {total >> 20} МБ" if total else ""))
            tmp.rename(dest)
            return dest
        except Exception as e:  # noqa: BLE001 — сеть нестабильна, повторяем
            log(f"  ошибка ({attempt}/{retries}): {e}")
            time.sleep(3 * attempt)
    raise RuntimeError(f"Не удалось скачать {url}")


# ───────────────────────── Частотность ─────────────────────────


def make_zipf(required: bool) -> tuple[Callable[[str], float], bool]:
    try:
        from wordfreq import zipf_frequency  # type: ignore[import-not-found]

        return (lambda w: float(zipf_frequency(w, "en"))), True
    except ImportError:
        if required:
            raise SystemExit("wordfreq не установлен: pip install wordfreq")
        log("ВНИМАНИЕ: wordfreq не найден — частотность не учитывается (только для образца/разработки).")
        return (lambda _w: 0.0), False


# ───────────────────────── Разбор статей Wiktionary ─────────────────────────

KEY_RE = re.compile(r"^[a-zà-ÿ][a-zà-ÿ' .\-]{0,39}$")
CYR_RE = re.compile(r"[Ѐ-ӿ]")

ACCENT_TAGS = {
    "us": {"us", "general-american", "genam", "american", "ga"},
    "uk": {"uk", "rp", "received-pronunciation", "british", "gb", "england"},
    "au": {"au", "australia", "australian", "general-australian"},
}
LOW_PRIORITY_TAGS = {"obsolete", "archaic", "rare", "dated", "historical", "nonstandard", "dialectal"}
KEEP_TAGS = {
    "informal", "slang", "colloquial", "formal", "literary", "vulgar", "offensive", "derogatory",
    "archaic", "obsolete", "dated", "rare", "figuratively", "humorous", "poetic", "technical",
    "transitive", "intransitive", "countable", "uncountable", "British", "US", "Australia",
}
GENDER_TAGS = {
    "masculine": "m", "feminine": "f", "neuter": "n", "plural": "pl",
    "perfective": "pf", "imperfective": "impf", "animate": "anim", "inanimate": "inan",
}
REL_FIELDS = {
    "synonyms": "syn", "antonyms": "ant", "hypernyms": "hyper", "hyponyms": "hypo",
    "related": "rel", "derived": "der", "coordinate_terms": "coord",
}
SKIP_POS = {"character", "symbol", "punct"}
POS_MAP = {
    "adj": "adjective", "adv": "adverb", "intj": "interjection", "prep": "preposition",
    "conj": "conjunction", "pron": "pronoun", "det": "determiner", "num": "numeral",
    "name": "proper noun", "abbrev": "abbreviation", "prep_phrase": "prepositional phrase",
    "adv_phrase": "adverbial phrase", "verb_phrase": "verb phrase",
}

CAPS = {
    "senses_per_pos": 8,
    "senses_total": 14,
    "examples_per_sense": 2,
    "tr_groups": 14,
    "tr_terms": 10,
    "rel_words": 24,
    "sense_rel": 8,
    "ipa": 4,
}


def accent_of(tags: Iterable[str]) -> str:
    low = {t.lower() for t in tags}
    for accent, names in ACCENT_TAGS.items():
        if low & names:
            return accent
    return "other"


def clean_text(s: Any, limit: int | None = None) -> str:
    if not isinstance(s, str):
        return ""
    s = _SPACE.sub(" ", s).strip()
    if limit and len(s) > limit:
        s = s[: limit - 1].rstrip() + "…"
    return s


def rel_words(items: Any) -> list[str]:
    out: list[str] = []
    for it in items or []:
        w = it.get("word") if isinstance(it, dict) else it
        if not isinstance(w, str):
            continue
        w = clean_text(w)
        if not w or len(w) > 30 or w.startswith("Thesaurus:") or ":" in w:
            continue
        if w not in out:
            out.append(w)
    return out


def sound_list(sounds: Any) -> list[tuple[str, str]]:
    seen: set[str] = set()
    got: list[tuple[str, str]] = []
    for s in sounds or []:
        if not isinstance(s, dict):
            continue
        ipa = clean_text(s.get("ipa"))
        if not ipa or ipa in seen:
            continue
        seen.add(ipa)
        got.append((ipa, accent_of(s.get("tags") or [])))
    # по одной записи на акцент в первую очередь
    got.sort(key=lambda p: {"us": 0, "uk": 1, "au": 2, "other": 3}[p[1]])
    firsts: list[tuple[str, str]] = []
    rest: list[tuple[str, str]] = []
    have: set[str] = set()
    for p in got:
        (rest if p[1] in have else firsts).append(p)
        have.add(p[1])
    return (firsts + rest)[: CAPS["ipa"]]


def clean_ru(word: Any) -> str | None:
    if not isinstance(word, str):
        return None
    w = unicodedata.normalize("NFC", word).replace("́", "").replace("̀", "")
    w = _SPACE.sub(" ", w).strip()
    if not w or len(w) > 60 or not CYR_RE.search(w) or "{{" in w or "[[" in w:
        return None
    return w


def tr_term(t: dict[str, Any]) -> dict[str, str] | None:
    w = clean_ru(t.get("word"))
    if not w:
        return None
    out = {"w": w}
    roman = clean_text(t.get("roman"))
    if roman:
        out["r"] = roman
    marks = [GENDER_TAGS[x] for x in (t.get("tags") or []) if x in GENDER_TAGS]
    if marks:
        out["x"] = " ".join(marks)
    return out


def translation_groups(entry: dict[str, Any], pos: str) -> list[dict[str, Any]]:
    """Русские переводы, сгруппированные по значению (trans-top)."""
    raw: list[tuple[str, dict[str, Any]]] = []
    for t in entry.get("translations") or []:
        if isinstance(t, dict):
            raw.append((clean_text(t.get("sense")), t))
    for s in entry.get("senses") or []:
        if not isinstance(s, dict):
            continue
        gloss = clean_text((s.get("glosses") or [""])[-1] if s.get("glosses") else "")
        for t in s.get("translations") or []:
            if isinstance(t, dict):
                raw.append((clean_text(t.get("sense")) or gloss, t))

    groups: dict[str, dict[str, Any]] = {}
    for sense, t in raw:
        code = t.get("lang_code") or t.get("code")
        if code != "ru":
            continue
        term = tr_term(t)
        if not term:
            continue
        g = groups.setdefault(sense, {"pos": pos, "g": sense, "t": []})
        if all(x["w"] != term["w"] for x in g["t"]):
            g["t"].append(term)
    out = []
    for g in groups.values():
        g["t"] = g["t"][: CAPS["tr_terms"]]
        if not g["g"]:
            del g["g"]
        out.append(g)
    return out


def process_entry(e: dict[str, Any]) -> dict[str, Any] | None:
    """Одна запись wiktextract → промежуточный словарь (или None, если не нужна)."""
    if e.get("lang_code") != "en":
        return None
    word = e.get("word")
    pos = e.get("pos") or ""
    if not isinstance(word, str) or pos in SKIP_POS:
        return None
    pos = POS_MAP.get(pos, pos).replace("_", " ")
    word = word.strip()
    key = norm_en(word)
    if not KEY_RE.match(key):
        return None

    senses_raw = [s for s in (e.get("senses") or []) if isinstance(s, dict)]
    lemma_senses: list[dict[str, Any]] = []
    redirect: tuple[list[str], str] | None = None

    for s in senses_raw:
        glosses = s.get("glosses") or []
        gloss = clean_text(glosses[-1] if glosses else "", 400)
        if not gloss or "no-gloss" in (s.get("tags") or []):
            continue
        form = s.get("form_of") or s.get("alt_of")
        if form:
            if redirect is None:
                lemmas = [clean_text(f.get("word")) for f in form if isinstance(f, dict) and f.get("word")]
                lemmas = [norm_en(x) for x in lemmas if x]
                if lemmas:
                    redirect = (lemmas[:2], gloss)
            continue
        tags = [t for t in (s.get("tags") or []) if isinstance(t, str)]
        sense: dict[str, Any] = {"d": gloss}
        exs: list[str] = []
        for ex in s.get("examples") or []:
            if not isinstance(ex, dict):
                continue
            text = clean_text(ex.get("text"))
            if not text or len(text) > 160 or (ex.get("type") == "quotation" and len(text) > 120):
                continue
            exs.append(text)
            if len(exs) >= CAPS["examples_per_sense"]:
                break
        if exs:
            sense["e"] = exs
        syn = rel_words(s.get("synonyms"))[: CAPS["sense_rel"]]
        ant = rel_words(s.get("antonyms"))[: CAPS["sense_rel"]]
        if syn:
            sense["y"] = syn
        if ant:
            sense["a"] = ant
        shown = [t for t in tags if t in KEEP_TAGS][:3]
        if shown:
            sense["g"] = shown
        sense["_low"] = 1 if any(t in LOW_PRIORITY_TAGS for t in tags) else 0
        lemma_senses.append(sense)

    if not lemma_senses and redirect is None:
        return None

    rel: dict[str, list[str]] = {}
    for field, name in REL_FIELDS.items():
        words = rel_words(e.get(field))
        for s in senses_raw:
            for w in rel_words(s.get(field)):
                if w not in words:
                    words.append(w)
        if words:
            rel[name] = words

    return {
        "word": word,
        "key": key,
        "pos": pos or "other",
        "senses": lemma_senses,
        "redirect": redirect,
        "ipa": sound_list(e.get("sounds")),
        "tr": translation_groups(e, pos or "other") if lemma_senses else [],
        "rel": rel,
        "et": clean_text(e.get("etymology_text"), 420),
    }


class Acc:
    """Накопитель статей одного ключа (разные этимологии и регистры сливаются)."""

    __slots__ = ("display", "pos_order", "senses", "ipa", "tr", "rel", "et", "redirect", "has_ru")

    def __init__(self) -> None:
        self.display = ""
        self.pos_order: list[str] = []
        self.senses: dict[str, list[dict[str, Any]]] = {}
        self.ipa: list[tuple[str, str]] = []
        self.tr: list[dict[str, Any]] = []
        self.rel: dict[str, list[str]] = {}
        self.et = ""
        self.redirect: tuple[list[str], str] | None = None
        self.has_ru = False

    def add(self, p: dict[str, Any]) -> None:
        word: str = p["word"]
        # отображаем строчную форму, если она есть
        if not self.display or (word == word.lower() and self.display != self.display.lower()):
            self.display = word
        if p["senses"]:
            pos = p["pos"]
            if pos not in self.senses:
                self.pos_order.append(pos)
                self.senses[pos] = []
            self.senses[pos].extend(p["senses"])
        if p["redirect"] and not self.redirect:
            self.redirect = p["redirect"]
        for ipa in p["ipa"]:
            if ipa not in self.ipa:
                self.ipa.append(ipa)
        if p["tr"]:
            self.has_ru = True
            self.tr.extend(p["tr"])
        for name, words in p["rel"].items():
            cur = self.rel.setdefault(name, [])
            for w in words:
                if w not in cur:
                    cur.append(w)
        if p["et"] and not self.et:
            self.et = p["et"]


def finalize(acc: Acc, zipf10: int) -> dict[str, Any] | None:
    """Накопитель → итоговая статья для JSON."""
    meanings: list[dict[str, Any]] = []
    total = 0
    for pos in acc.pos_order:
        senses = sorted(acc.senses[pos], key=lambda s: s["_low"])  # стабильная: редкие — в конец
        seen: set[str] = set()
        uniq: list[dict[str, Any]] = []
        for s in senses:
            low = s["d"].lower()
            if low in seen:
                continue
            seen.add(low)
            uniq.append({k: v for k, v in s.items() if k != "_low"})
        uniq = uniq[: CAPS["senses_per_pos"]]
        if total + len(uniq) > CAPS["senses_total"]:
            uniq = uniq[: max(0, CAPS["senses_total"] - total)]
        if uniq:
            meanings.append({"t": pos, "s": uniq})
            total += len(uniq)

    if not meanings:
        if acc.redirect:
            lemmas, gloss = acc.redirect
            return {"w": acc.display, "z": zipf10, "r": lemmas, "rg": clean_text(gloss, 160)}
        return None

    out: dict[str, Any] = {"w": acc.display, "z": zipf10, "m": meanings}
    if acc.ipa:
        out["p"] = [list(p) for p in acc.ipa[: CAPS["ipa"]]]
    if acc.tr:
        out["tr"] = merge_tr(acc.tr)
    if acc.rel:
        out["rel"] = {k: v[: CAPS["rel_words"]] for k, v in acc.rel.items()}
    if acc.et:
        out["et"] = acc.et
    return out


def merge_tr(groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for g in groups:
        k = (g.get("pos", ""), (g.get("g") or "").lower())
        cur = merged.get(k)
        if not cur:
            merged[k] = {**g, "t": list(g["t"])}
            continue
        for t in g["t"]:
            if all(x["w"] != t["w"] for x in cur["t"]):
                cur["t"].append(t)
    out = list(merged.values())[: CAPS["tr_groups"]]
    for g in out:
        g["t"] = g["t"][: CAPS["tr_terms"]]
        # компактно: термин без пометок — просто строка
        g["t"] = [t["w"] if set(t) == {"w"} else t for t in g["t"]]
    return out


# ───────────────────────── Чтение дампа ─────────────────────────


def iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with open_text(path) as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                yield obj
            if n % 200_000 == 0:
                log(f"    прочитано строк: {n:,}")


def build_accumulators(
    entries: Iterable[dict[str, Any]], zipf: Callable[[str], float], have_freq: bool
) -> tuple[dict[str, Acc], dict[str, float]]:
    accs: dict[str, Acc] = {}
    zcache: dict[str, float] = {}
    kept = 0
    for e in entries:
        p = process_entry(e)
        if p is None:
            continue
        key = p["key"]
        z = zcache.get(key)
        if z is None:
            z = zipf(key)
            zcache[key] = z
        has_ru = bool(p["tr"])
        # ранний отсев: мусорные редкие слова без русского перевода
        if have_freq and z < 1.0 and not has_ru:
            continue
        if have_freq and z < 0.5:
            continue
        acc = accs.get(key)
        if acc is None:
            acc = accs[key] = Acc()
        acc.add(p)
        kept += 1
    log(f"  статей принято: {kept:,}, ключей: {len(accs):,}")
    return accs, zcache


# ───────────────────────── Tatoeba ─────────────────────────


def read_sentences(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with open_text(path) as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3:
                out[parts[0]] = parts[2]
    return out


def iter_links(path: Path) -> Iterator[tuple[str, str]]:
    name = path.name.lower()
    if name.endswith(".tar.bz2") or name.endswith(".tar.gz") or name.endswith(".tar"):
        with tarfile.open(path, "r:*") as tar:
            for member in tar:
                if member.isfile() and member.name.endswith(("links.csv", "links.tsv")):
                    f = tar.extractfile(member)
                    if f is None:
                        continue
                    for raw in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                        a = raw.rstrip("\n").split("\t")
                        if len(a) >= 2:
                            yield a[0], a[1]
                    return
        return
    with open_text(path) as f:
        for raw in f:
            a = raw.rstrip("\n").split("\t")
            if len(a) >= 2:
                yield a[0], a[1]


TOKEN_RE = re.compile(r"[a-zà-ÿ]+(?:'[a-z]+)?")
SUFFIXES = ("s", "es", "ed", "d", "ing", "er", "est", "ly")


def candidates(token: str, keys: set[str], redirects: dict[str, str]) -> set[str]:
    out: set[str] = set()
    if token in keys:
        out.add(token)
    if token in redirects:
        out.add(redirects[token])
    for suf in SUFFIXES:
        if token.endswith(suf) and len(token) - len(suf) >= 3:
            stem = token[: -len(suf)]
            for cand in (stem, stem + "e", stem[:-1] if len(stem) > 3 and stem[-1] == stem[-2] else None):
                if cand and cand in keys:
                    out.add(cand)
    return out


def sentence_index(
    eng: Path, rus: Path, links: Path, keys: set[str], redirects: dict[str, str], per_word: int = 3
) -> dict[str, list[list[str]]]:
    log("  Tatoeba: чтение предложений…")
    en = read_sentences(eng)
    ru = read_sentences(rus)
    log(f"    eng: {len(en):,}  rus: {len(ru):,}")

    best: dict[str, list[tuple[float, int, str, str]]] = defaultdict(list)
    seen_pairs: set[tuple[str, str]] = set()
    n_pairs = 0
    for a, b in iter_links(links):
        if a in en and b in ru:
            pair = (a, b)
        elif b in en and a in ru:
            pair = (b, a)
        else:
            continue
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        text_en, text_ru = en[pair[0]], ru[pair[1]]
        if not (18 <= len(text_en) <= 110) or len(text_ru) > 150:
            continue
        n_pairs += 1
        score = abs(len(text_en) - 55) / 55.0  # чем ближе к ~55 символам, тем лучше
        tokens = set(TOKEN_RE.findall(text_en.lower().replace("’", "'")))
        words: set[str] = set()
        for tok in tokens:
            words |= candidates(tok, keys, redirects)
        for w in words:
            lst = best[w]
            lst.append((score, len(lst), text_en, text_ru))
            if len(lst) > per_word * 4:
                lst.sort()
                del lst[per_word * 2 :]
    log(f"    пар EN↔RU: {n_pairs:,}")

    out: dict[str, list[list[str]]] = {}
    for w, lst in best.items():
        lst.sort()
        uniq: list[list[str]] = []
        for _s, _i, a, b in lst:
            if all(a != u[0] for u in uniq):
                uniq.append([a, b])
            if len(uniq) >= per_word:
                break
        if uniq:
            out[w] = uniq
    return out


# ───────────────────────── Запись результата ─────────────────────────


def dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write_shards(out: Path, folder: str, count: int, items: dict[str, Any]) -> int:
    buckets: dict[int, dict[str, Any]] = defaultdict(dict)
    for k, v in items.items():
        buckets[shard_of(k, count)][k] = v
    target = out / folder
    target.mkdir(parents=True, exist_ok=True)
    for idx, bucket in buckets.items():
        (target / f"{idx:03d}.json").write_text(dump(bucket), encoding="utf-8")
    return len(buckets)


def build(
    kaikki: Path,
    out: Path,
    max_words: int,
    min_zipf: float,
    zipf: Callable[[str], float],
    have_freq: bool,
    tatoeba: tuple[Path, Path, Path] | None,
) -> dict[str, Any]:
    log("Разбор Wiktionary…")
    accs, zcache = build_accumulators(iter_jsonl(kaikki), zipf, have_freq)

    # Отбор: частотные слова + слова с русским переводом, ограничение по max_words.
    ranked: list[tuple[float, str]] = []
    for key, acc in accs.items():
        z = zcache.get(key, 0.0)
        if have_freq and z < min_zipf and not (acc.has_ru and z >= 1.5):
            continue
        ranked.append((z + (0.5 if acc.has_ru else 0.0), key))
    ranked.sort(key=lambda x: (-x[0], x[1]))
    chosen = [k for _s, k in ranked[:max_words]]
    log(f"  отобрано слов: {len(chosen):,} из {len(accs):,}")

    entries: dict[str, dict[str, Any]] = {}
    redirects: dict[str, str] = {}
    for key in chosen:
        z10 = int(round(min(max(zcache.get(key, 0.0), 0.0), 8.0) * 10))
        art = finalize(accs[key], z10)
        if art is None:
            continue
        entries[key] = art
        if "r" in art:
            redirects[key] = art["r"][0]
    # висячие перенаправления (лемма не попала в словарь) не нужны
    for key in [k for k, a in entries.items() if "r" in a and not any(r in entries for r in a["r"])]:
        del entries[key]
        redirects.pop(key, None)

    # Обратный индекс RU → EN
    log("Обратный индекс RU→EN…")
    reverse: dict[str, dict[str, int]] = defaultdict(dict)
    display: dict[str, str] = {}
    for key, art in entries.items():
        for g in art.get("tr", []):
            for t in g["t"]:
                w = t if isinstance(t, str) else t["w"]
                rk = norm_ru(w)
                if not rk or len(rk) > 40:
                    continue
                reverse[rk][key] = max(reverse[rk].get(key, 0), art["z"])
                if rk != w.lower() and rk not in display:
                    display[rk] = w.lower()
    rev_out = {
        rk: [w for w, _z in sorted(m.items(), key=lambda kv: (-kv[1], kv[0]))[:40]] for rk, m in reverse.items()
    }

    sentences: dict[str, list[list[str]]] = {}
    if tatoeba:
        try:
            sentences = sentence_index(*tatoeba, keys=set(entries), redirects=redirects)
            sentences = {w: s for w, s in sentences.items() if w in entries and "r" not in entries[w]}
        except Exception as e:  # noqa: BLE001
            log(f"  Tatoeba пропущена: {e}")

    # Запись
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    n_e = write_shards(out, "e", SHARDS_E, entries)
    n_r = write_shards(out, "r", SHARDS_R, rev_out)
    n_s = write_shards(out, "s", SHARDS_S, sentences) if sentences else 0

    (out / "words.txt").write_text(
        "\n".join(f"{k}\t{entries[k]['z']}" for k in sorted(entries)) + "\n", encoding="utf-8"
    )
    rlines = []
    for rk in sorted(rev_out):
        score = max(reverse[rk].values())
        rlines.append(f"{rk}\t{score}" + (f"\t{display[rk]}" if rk in display else ""))
    (out / "rwords.txt").write_text("\n".join(rlines) + "\n", encoding="utf-8")

    meta = {
        "schema": SCHEMA,
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "words": sum(1 for a in entries.values() if "r" not in a),
        "forms": sum(1 for a in entries.values() if "r" in a),
        "translated": sum(1 for a in entries.values() if "tr" in a),
        "ruTerms": len(rev_out),
        "sentences": sum(len(v) for v in sentences.values()),
        "shards": {"e": SHARDS_E, "r": SHARDS_R, "s": SHARDS_S},
        "files": {"e": n_e, "r": n_r, "s": n_s},
        "frequency": have_freq,
        "sources": ["Wiktionary (kaikki.org, CC BY-SA)", "wordfreq (CC BY-SA)", "Tatoeba (CC BY 2.0 FR)"],
    }
    (out / "meta.json").write_text(dump(meta), encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    log(f"Готово: {meta['words']:,} слов, {meta['forms']:,} форм, {meta['ruTerms']:,} русских терминов, "
        f"{meta['sentences']:,} предложений, {size / 1e6:.1f} МБ → {out}")
    return meta


# ───────────────────────── CLI ─────────────────────────


def fetch_kaikki(cache: Path, urls: list[str]) -> Path:
    last: Exception | None = None
    for url in urls:
        try:
            return download(url, cache / Path(url).name)
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"  недоступно: {url}")
    raise SystemExit(f"Не удалось скачать дамп kaikki: {last}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Сборка офлайн-словаря datalaw_lexa")
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "data")
    ap.add_argument("--cache", type=Path, default=ROOT / ".data-cache")
    ap.add_argument("--download", action="store_true", help="скачать исходные дампы")
    ap.add_argument("--sample", action="store_true", help="собрать крошечный образец (без сети)")
    ap.add_argument("--kaikki", type=Path)
    ap.add_argument("--kaikki-url", action="append", default=[])
    ap.add_argument("--tatoeba-eng", type=Path)
    ap.add_argument("--tatoeba-rus", type=Path)
    ap.add_argument("--tatoeba-links", type=Path)
    ap.add_argument("--no-tatoeba", action="store_true")
    ap.add_argument("--max-words", type=int, default=90_000)
    ap.add_argument("--min-zipf", type=float, default=2.8)
    ap.add_argument("--require-wordfreq", action="store_true")
    a = ap.parse_args(argv)

    tatoeba: tuple[Path, Path, Path] | None = None

    if a.sample:
        kaikki = SAMPLE / "kaikki-sample.jsonl"
        tatoeba = (SAMPLE / "tatoeba-eng.tsv", SAMPLE / "tatoeba-rus.tsv", SAMPLE / "tatoeba-links.tsv")
        zipf, have_freq = _sample_zipf, True  # образец не зависит от wordfreq
    else:
        zipf, have_freq = make_zipf(a.require_wordfreq)
        if a.download:
            kaikki = a.kaikki or fetch_kaikki(a.cache, a.kaikki_url or KAIKKI_URLS)
        elif a.kaikki:
            kaikki = a.kaikki
        else:
            ap.error("укажите --download, --sample или --kaikki ФАЙЛ")
        if not a.no_tatoeba:
            try:
                eng = a.tatoeba_eng or (download(TATOEBA_ENG, a.cache / "eng_sentences.tsv.bz2") if a.download else None)
                rus = a.tatoeba_rus or (download(TATOEBA_RUS, a.cache / "rus_sentences.tsv.bz2") if a.download else None)
                lnk = a.tatoeba_links or (download(TATOEBA_LINKS, a.cache / "links.tar.bz2") if a.download else None)
                if eng and rus and lnk:
                    tatoeba = (eng, rus, lnk)
            except Exception as e:  # noqa: BLE001
                log(f"ВНИМАНИЕ: Tatoeba недоступна, примеры-предложения не будут собраны: {e}")

    build(kaikki, a.out, a.max_words, a.min_zipf, zipf, have_freq, tatoeba)
    return 0


_SAMPLE_Z = {
    "hello": 4.9, "run": 5.1, "ran": 4.5, "polish": 3.6, "cafe": 3.9, "café": 3.5, "ice cream": 3.9,
    "walk": 4.8, "house": 5.3, "blue": 4.9, "quixotic": 1.2, "zzyzx": 0.0, "bank": 4.9,
}


def _sample_zipf(w: str) -> float:
    return _SAMPLE_Z.get(w, 3.0)


if __name__ == "__main__":
    raise SystemExit(main())
