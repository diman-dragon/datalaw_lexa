package app.datalaw.lexa.core

/** Формат офлайн-данных (см. scripts/build_data.py). */

data class Sense(
    /** определение */
    val d: String,
    /** примеры */
    val e: List<String> = emptyList(),
    /** синонимы значения */
    val y: List<String> = emptyList(),
    /** антонимы значения */
    val a: List<String> = emptyList(),
    /** пометки: informal, slang, obsolete … */
    val g: List<String> = emptyList(),
)

data class Meaning(
    /** часть речи */
    val t: String,
    val s: List<Sense>,
)

/** Русский перевод: слово, транскрипция/пояснение (r), грамматические пометки (x). */
data class TrTerm(val w: String, val r: String? = null, val x: String? = null)

data class TrGroup(
    val pos: String? = null,
    /** значение, к которому относятся переводы */
    val g: String? = null,
    val t: List<TrTerm>,
)

data class Pron(val ipa: String, val accent: String)

enum class RelationKey(val id: String) {
    SYN("syn"), ANT("ant"), HYPER("hyper"), HYPO("hypo"), REL("rel"), DER("der"), COORD("coord");

    companion object {
        fun of(id: String): RelationKey? = entries.firstOrNull { it.id == id }
    }
}

data class Entry(
    /** написание */
    val w: String,
    /** Zipf-частотность × 10 */
    val z: Int? = null,
    /** транскрипции */
    val p: List<Pron> = emptyList(),
    val m: List<Meaning> = emptyList(),
    val tr: List<TrGroup> = emptyList(),
    val rel: Map<RelationKey, List<String>> = emptyMap(),
    /** этимология */
    val et: String? = null,
    /** перенаправление: это форма другого слова */
    val r: List<String> = emptyList(),
    /** пояснение формы («simple past of run») */
    val rg: String? = null,
) {
    val isForm: Boolean get() = r.isNotEmpty()
}

data class Meta(
    val schema: Int,
    val built: String,
    val words: Int,
    val forms: Int,
    val translated: Int,
    val ruTerms: Int,
    val sentences: Int,
    val frequency: Boolean,
)

/** Предложение Tatoeba: английское + русское. */
data class SentencePair(val en: String, val ru: String)
