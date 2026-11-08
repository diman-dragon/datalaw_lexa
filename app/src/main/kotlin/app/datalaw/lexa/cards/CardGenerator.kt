package app.datalaw.lexa.cards

import app.datalaw.lexa.core.Entry
import app.datalaw.lexa.core.EntryUtil
import app.datalaw.lexa.core.Search
import app.datalaw.lexa.core.Text
import app.datalaw.lexa.data.DictionarySource
import app.datalaw.lexa.ui.i18n.posLabelRu

data class GenOptions(
    /** добавлять «to» перед глаголами: «suggest» → «to suggest» */
    val addTo: Boolean = true,
    /** сколько переводов класть на оборот */
    val maxTranslations: Int = 3,
    /** произношение для транскрипции в подсказке: "us" или "uk" */
    val accent: String = "us",
)

/** Результат разбора одного слова. */
data class GenResult(
    val status: CardStatus,
    val front: String,
    val back: String = "",
    val hint: String = "",
    val alternatives: List<ExamplePair> = emptyList(),
    val via: String? = null,
    val suggestions: List<String> = emptyList(),
    val suggestionsAreTranslations: Boolean = false,
)

/** Чистая логика сборки карточки — отдельно от Android, чтобы её можно было тестировать. */
object CardLogic {
    private val ARTICLES = listOf("a ", "an ", "the ")

    /** Ключи для поиска в словаре, от самого точного: «to suggest» → [«to suggest», «suggest»]. */
    fun candidateKeys(input: String): List<String> {
        val norm = Text.normalizeEn(input)
        val out = LinkedHashSet<String>()
        if (norm.isNotEmpty()) out.add(norm)
        if (norm.startsWith("to ")) out.add(norm.removePrefix("to ").trim())
        for (a in ARTICLES) if (norm.startsWith(a)) out.add(norm.removePrefix(a).trim())
        return out.filter { it.isNotEmpty() }
    }

    /** Ключ для сравнения карточек: «To suggest.» и «suggest» — одно и то же. */
    fun dedupKey(front: String): String = Text.normalizeEn(front).removePrefix("to ").trim()

    /** Слово встречается в предложении (в т.ч. с окончанием), как в подсветке примеров. */
    fun containsWord(sentence: String, word: String): Boolean {
        if (word.isBlank()) return false
        val re = Regex("(?<!\\p{L})" + Regex.escape(word) + "(?:s|es|ed|ing|d|er|est|ly)?(?!\\p{L})", RegexOption.IGNORE_CASE)
        return re.containsMatchIn(sentence)
    }

    /**
     * Примеры: сначала пары Tatoeba (с переводом), затем примеры из словаря (без перевода).
     * Внутри Tatoeba — предложения с той формой слова, что ввёл пользователь, и средней длины.
     */
    fun chooseExamples(
        pairs: List<app.datalaw.lexa.core.SentencePair>,
        dictionaryExamples: List<String>,
        surfaceKey: String,
        limit: Int = 6,
    ): List<ExamplePair> {
        fun penalty(len: Int): Int = when {
            len < 20 -> 20 - len
            len > 80 -> len - 80
            else -> 0
        }
        val ranked = pairs
            .filter { it.en.isNotBlank() && it.ru.isNotBlank() }
            .sortedBy { (if (containsWord(it.en, surfaceKey)) 0 else 1000) + penalty(it.en.length) * 2 + it.en.length / 10 }
            .take(limit)
            .map { ExamplePair(it.en.trim(), it.ru.trim()) }
        val fromDict = dictionaryExamples
            .map { it.trim() }
            .filter { it.isNotEmpty() && it.length <= 140 }
            .distinct()
            .sortedBy { penalty(it.length) }
            .map { ExamplePair(it, "") }
        return (ranked + fromDict).distinctBy { it.en }.take(limit + 2)
    }

    /**
     * Подсказка для лицевой стороны: «/транскрипция/ · часть речи» и со второй строки короткое английское
     * определение. Перевода в ней нет — она помогает вспомнить слово, а не выдаёт ответ.
     */
    fun hint(entry: Entry, verb: Boolean, accent: String, maxDef: Int = 80): String {
        val meaning = (if (verb) entry.m.firstOrNull { it.t.equals("verb", ignoreCase = true) } else null) ?: entry.m.firstOrNull()
        val head = listOfNotNull(
            EntryUtil.ipaFor(entry, accent)?.takeIf { it.isNotBlank() },
            meaning?.t?.takeIf { it.isNotBlank() }?.let(::posLabelRu),
        ).joinToString(" · ")
        val def = meaning?.s?.firstOrNull()?.d?.trim()?.let { d ->
            val one = d.lineSequence().first().trim().trimEnd('.', ':', ';')
            if (one.length > maxDef) one.take(maxDef - 1).trimEnd() + "…" else one
        }.orEmpty()
        return listOf(head, def).filter { it.isNotEmpty() }.joinToString("\n")
    }

    fun dictionaryExamples(entry: Entry): List<String> =
        entry.m.flatMap { m -> m.s.flatMap { it.e } }

    /** Все значения — глагольные, а пользователь «to» не писал. */
    fun isVerbOnly(entry: Entry): Boolean = entry.m.isNotEmpty() && entry.m.all { it.t.equals("verb", ignoreCase = true) }
}

class CardGenerator(private val dict: DictionarySource) {

    suspend fun generate(rawInput: String, opts: GenOptions = GenOptions()): GenResult {
        val input = Text.tidy(rawInput)
        if (input.isEmpty()) return GenResult(CardStatus.NOT_FOUND, input)

        // Русский ввод: подсказываем английские эквиваленты из обратного индекса
        if (Text.detectScript(input) == Text.Script.CYRILLIC) {
            val eng = dict.getReverse(Text.normalizeRu(input)).take(8)
            return GenResult(CardStatus.NOT_FOUND, input, suggestions = eng, suggestionsAreTranslations = true)
        }

        val keys = CardLogic.candidateKeys(input)
        var entry: Entry? = null
        var usedKey = ""
        for (k in keys) {
            val e = dict.getEntry(k)
            if (e != null) {
                entry = e
                usedKey = k
                break
            }
        }
        if (entry == null) {
            val ix = dict.enIndex()
            val similar = keys.lastOrNull()?.let { Search.suggestSimilar(ix, it, 6).map { h -> h.label } } ?: emptyList()
            return GenResult(CardStatus.NOT_FOUND, input, suggestions = similar)
        }

        // Форма слова («ran») → статья леммы («run»)
        var lemmaKey = usedKey
        var via: String? = null
        if (entry.isForm) {
            var lemma: Entry? = null
            for (r in entry.r) {
                val e = dict.getEntry(r)
                if (e != null && !e.isForm) {
                    lemma = e
                    lemmaKey = r
                    via = r
                    break
                }
            }
            if (lemma == null) return GenResult(CardStatus.NO_TRANSLATION, input, via = entry.r.firstOrNull())
            entry = lemma
        }

        val stripped = keys.size > 1 && usedKey != keys.first() && Text.normalizeEn(input).startsWith("to ")
        val back = EntryUtil
            .topTranslations(entry.tr, opts.maxTranslations.coerceIn(1, 6), if (stripped) "verb" else null)
            .joinToString(", ")

        val pairs = dict.getSentences(lemmaKey)
        val examples = CardLogic.chooseExamples(pairs, CardLogic.dictionaryExamples(entry), keys.first())

        val addTo = opts.addTo && via == null && !Text.normalizeEn(input).startsWith("to ") && CardLogic.isVerbOnly(entry)
        val front = if (addTo) "to $input" else input

        return GenResult(
            status = if (back.isBlank()) CardStatus.NO_TRANSLATION else CardStatus.READY,
            front = front,
            back = back,
            hint = CardLogic.hint(entry, verb = stripped || front.startsWith("to "), accent = opts.accent),
            alternatives = examples,
            via = via,
        )
    }
}
