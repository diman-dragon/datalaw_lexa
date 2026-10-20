#!/usr/bin/env python3
"""Тесты пайплайна данных: python3 scripts/test_build_data.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402


class Helpers(unittest.TestCase):
    def test_fnv1a_golden(self) -> None:
        # те же значения проверяются в tests/hash.test.ts — шардирование обязано совпадать
        self.assertEqual(b.fnv1a(""), 2166136261)
        self.assertEqual(b.fnv1a("hello"), 1335831723)
        self.assertEqual(b.fnv1a("café"), 2821410889)
        self.assertEqual(b.fnv1a("привет"), 2168984447)
        self.assertEqual(b.shard_of("hello", 512), 171)
        self.assertEqual(b.shard_of("привет", 128), 127)

    def test_normalization(self) -> None:
        self.assertEqual(b.norm_en("  “Don’t  Stop!” "), "don't stop")
        self.assertEqual(b.norm_ru("  Моро́женое, "), "мороженое")
        self.assertEqual(b.norm_ru("Ёж"), "еж")

    def test_accent(self) -> None:
        self.assertEqual(b.accent_of(["US", "General-American"]), "us")
        self.assertEqual(b.accent_of(["Received-Pronunciation"]), "uk")
        self.assertEqual(b.accent_of(["Australia"]), "au")
        self.assertEqual(b.accent_of([]), "other")


class Sample(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name) / "data"
        b.main(["--sample", "--out", str(cls.out)])
        cls.entries: dict = {}
        for f in (cls.out / "e").glob("*.json"):
            cls.entries.update(json.loads(f.read_text(encoding="utf-8")))

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def shard_ok(self, folder: str, count: int, key: str) -> dict:
        path = self.out / folder / f"{b.shard_of(key, count):03d}.json"
        self.assertTrue(path.exists(), f"нет шарда для {key}")
        return json.loads(path.read_text(encoding="utf-8"))

    def test_meta_and_lists(self) -> None:
        meta = json.loads((self.out / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["schema"], 1)
        self.assertEqual(meta["words"], 9)
        self.assertEqual(meta["forms"], 1)
        words = (self.out / "words.txt").read_text(encoding="utf-8").splitlines()
        keys = [w.split("\t")[0] for w in words]
        self.assertEqual(keys, sorted(keys))
        self.assertIn("hello", keys)
        self.assertNotIn("quixotic", keys, "редкое слово отсеяно по частоте")
        self.assertNotIn("zzyzx", keys)
        self.assertNotIn("123", keys, "некорректный ключ")
        self.assertNotIn("haus", keys, "чужой язык")

    def test_entry_shard_lookup(self) -> None:
        shard = self.shard_ok("e", b.SHARDS_E, "hello")
        self.assertIn("hello", shard)

    def test_hello(self) -> None:
        e = self.entries["hello"]
        self.assertEqual([m["t"] for m in e["m"]], ["interjection", "noun"])
        self.assertEqual(e["p"][0], ["/həˈloʊ/", "us"])
        self.assertIn(["/həˈləʊ/", "uk"], e["p"])
        greet = e["tr"][0]
        self.assertEqual(greet["g"], "greeting")
        self.assertEqual(greet["t"][0], {"w": "привет", "x": "m"})
        self.assertEqual(greet["t"][1], {"w": "здравствуйте", "r": "zdrávstvujte"})  # ударение снято
        self.assertEqual(e["tr"][1]["t"], ["алло"])  # термин без пометок — строка
        self.assertEqual(e["m"][0]["s"][0]["y"], ["hi", "greetings"])
        self.assertEqual(e["rel"]["syn"][:2], ["hi", "howdy"])

    def test_run_sense_order_and_relations(self) -> None:
        e = self.entries["run"]
        verb = e["m"][0]["s"]
        self.assertEqual(verb[-1]["g"], ["obsolete"], "устаревшие значения — в конце")
        self.assertEqual(e["rel"]["ant"], ["walk"])
        self.assertEqual(e["rel"]["der"], ["runner"], "Thesaurus:* отброшены")
        self.assertEqual(e["rel"]["hyper"], ["move"])

    def test_redirect(self) -> None:
        self.assertEqual(self.entries["ran"], {"w": "ran", "z": 45, "r": ["run"], "rg": "simple past of run"})

    def test_case_merge(self) -> None:
        e = self.entries["polish"]
        self.assertEqual(e["w"], "polish")
        self.assertEqual({m["t"] for m in e["m"]}, {"adjective", "verb"})
        self.assertNotIn("Polish", self.entries)

    def test_accents_and_phrases(self) -> None:
        self.assertIn("café", self.entries)
        self.assertEqual(self.entries["ice cream"]["tr"][0]["t"][0]["w"], "мороженое")

    def test_reverse_index(self) -> None:
        rev = self.shard_ok("r", b.SHARDS_R, "привет")
        self.assertEqual(rev["привет"], ["hello"])
        rev = self.shard_ok("r", b.SHARDS_R, "мороженое")
        self.assertEqual(rev["мороженое"], ["ice cream"])
        lines = (self.out / "rwords.txt").read_text(encoding="utf-8").splitlines()
        self.assertIn("дом\t53", lines)

    def test_sentences(self) -> None:
        s = self.shard_ok("s", b.SHARDS_S, "house")
        self.assertEqual(s["house"][0][1], "Они купили красивый дом у моря.")
        s = self.shard_ok("s", b.SHARDS_S, "run")
        texts = [p[0] for p in s["run"]]
        self.assertIn("She ran home as fast as she could.", texts, "форма «ran» привязана к run")


if __name__ == "__main__":
    unittest.main(verbosity=2)
