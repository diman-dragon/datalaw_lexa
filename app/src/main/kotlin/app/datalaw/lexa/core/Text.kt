package app.datalaw.lexa.core

import java.text.Normalizer

/** Нормализация ключей — как norm_en()/norm_ru() в scripts/build_data.py. */
object Text {
    private val SPACES = Regex("[\\s\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000]+")
    private val EDGE = Regex("^[\\s\"'“”«»(\\[]+|[\\s\"'“”«»)\\].,;:!?]+$")

    private fun base(input: String): String =
        Normalizer.normalize(input, Normalizer.Form.NFC)

    /** Ключ английского слова. */
    fun normalizeEn(input: String): String =
        base(input)
            .replace('‘', '\'')
            .replace('’', '\'')
            .replace(SPACES, " ")
            .trim()
            .replace(EDGE, "")
            .lowercase()

    /** Ключ русского термина: без ударений, ё → е. */
    fun normalizeRu(input: String): String =
        base(input)
            .replace("\u0301", "")
            .replace("\u0300", "")
            .replace(SPACES, " ")
            .trim()
            .replace(EDGE, "")
            .lowercase()
            .replace('ё', 'е')

    /** Пробелы схлопнуты, края обрезаны; регистр и пунктуация сохранены. */
    fun tidy(input: String): String = base(input).replace(SPACES, " ").trim()

    enum class Script { LATIN, CYRILLIC, OTHER }

    /** На каком языке введён запрос — по первой букве. */
    fun detectScript(text: String): Script {
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            if (Character.isLetter(cp)) {
                return when (Character.UnicodeScript.of(cp)) {
                    Character.UnicodeScript.CYRILLIC -> Script.CYRILLIC
                    Character.UnicodeScript.LATIN -> Script.LATIN
                    else -> Script.OTHER
                }
            }
            i += Character.charCount(cp)
        }
        return Script.OTHER
    }
}
