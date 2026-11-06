package app.datalaw.lexa.core

import java.time.LocalDate

enum class FrequencyBand(val level: Int) { VERY_COMMON(4), COMMON(3), UNCOMMON(2), RARE(1) }

object EntryUtil {
    fun ipaFor(entry: Entry, accent: String): String? =
        entry.p.firstOrNull { it.accent == accent }?.ipa ?: entry.p.firstOrNull()?.ipa

    fun accentsAvailable(entry: Entry): List<String> =
        entry.p.map { it.accent }.filter { it == "us" || it == "uk" }.distinct()

    fun firstDefinition(entry: Entry?, max: Int = 90): String? {
        val d = entry?.m?.firstOrNull()?.s?.firstOrNull()?.d ?: return null
        return if (d.length > max) d.take(max - 1) + "…" else d
    }

    /**
     * Самые частые переводы — по одному из каждого значения, без повторов.
     * preferPos — если задано и есть группы этой части речи, берём только их.
     */
    fun topTranslations(groups: List<TrGroup>, limit: Int = 4, preferPos: String? = null): List<String> {
        val pool = preferPos
            ?.let { pos -> groups.filter { it.pos.equals(pos, ignoreCase = true) } }
            ?.takeIf { it.isNotEmpty() }
            ?: groups
        val seen = HashSet<String>()
        val out = ArrayList<String>()
        val rounds = pool.maxOfOrNull { it.t.size } ?: 0
        for (i in 0 until rounds) {
            if (out.size >= limit) break
            for (g in pool) {
                val term = g.t.getOrNull(i) ?: continue
                val text = term.w.trim()
                if (text.isEmpty() || !seen.add(text.lowercase())) continue
                out.add(text)
                if (out.size >= limit) break
            }
        }
        return out
    }

    /** z — Zipf × 10: 50+ — «the», «have»; 40+ — обычная лексика; 30+ — редкая; ниже — очень редкая. */
    fun frequencyBand(z: Int?): FrequencyBand? = when {
        z == null || z <= 0 -> null
        z >= 50 -> FrequencyBand.VERY_COMMON
        z >= 40 -> FrequencyBand.COMMON
        z >= 30 -> FrequencyBand.UNCOMMON
        else -> FrequencyBand.RARE
    }

    /** Слова дня — выразительная лексика B2–C2; в словарь попадают, если есть в данных. */
    val WORDS_OF_THE_DAY: List<String> = listOf(
        "serendipity", "ephemeral", "ineffable", "mellifluous", "ubiquitous", "pragmatic", "eloquent",
        "resilient", "nostalgia", "labyrinth", "solitude", "luminous", "meticulous", "candid", "ambiguous",
        "whimsical", "tenacious", "serene", "vivid", "quaint", "zeal", "benevolent", "diligent", "elusive",
        "enigma", "gregarious", "harbinger", "juxtapose", "kindle", "lucid", "meander", "nuance", "obscure",
        "paradox", "reminisce", "tangible", "unwavering", "venerable", "wanderlust", "zenith", "acumen",
        "ardent", "bucolic", "capricious", "dichotomy", "formidable", "halcyon", "impeccable", "jubilant",
        "languid", "nebulous", "opulent", "pensive", "quixotic", "sanguine", "taciturn", "utopia", "wistful",
        "yearn", "zephyr", "brevity", "catharsis", "dexterity", "empathy", "grapple", "hubris", "imminent",
        "levity", "mirth", "oblivion", "perennial", "reverie", "solace", "verdant", "zest", "alacrity",
        "burgeon", "clandestine", "deft", "enthrall", "flourish", "grit", "illuminate",
    )

    fun wordOfTheDay(offset: Int = 0, today: LocalDate = LocalDate.now()): String {
        val n = WORDS_OF_THE_DAY.size
        val idx = (((today.toEpochDay() + offset) % n) + n) % n
        return WORDS_OF_THE_DAY[idx.toInt()]
    }
}
