package app.datalaw.lexa

import app.datalaw.lexa.core.EntryParse
import app.datalaw.lexa.core.EntryUtil
import app.datalaw.lexa.core.Hash
import app.datalaw.lexa.core.Search
import app.datalaw.lexa.core.Text
import app.datalaw.lexa.core.WordIndex
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class CoreTest {
    /** Значения посчитаны scripts/build_data.py — хэши обязаны совпадать, иначе приложение не найдёт файлы. */
    @Test
    fun fnv1aMatchesPythonBuilder() {
        assertEquals(1335831723L, Hash.fnv1a("hello"))
        assertEquals(2686853648L, Hash.fnv1a("walk"))
        assertEquals(2821410889L, Hash.fnv1a("café"))
        assertEquals(579243040L, Hash.fnv1a("бег"))
    }

    @Test
    fun shardPaths() {
        assertEquals("e/016.json", Hash.shardPath("e", "walk"))
        assertEquals("e/151.json", Hash.shardPath("e", "bank"))
        assertEquals("e/286.json", Hash.shardPath("e", "ice cream"))
        assertEquals("r/032.json", Hash.shardPath("r", "бег"))
        assertEquals("s/016.json", Hash.shardPath("s", "walk"))
    }

    @Test
    fun normalization() {
        assertEquals("hello", Text.normalizeEn("  “Hello!” "))
        assertEquals("it's", Text.normalizeEn("It’s"))
        assertEquals("ice cream", Text.normalizeEn("Ice   cream."))
        assertEquals("елка", Text.normalizeRu("Ёлка"))
        assertEquals("замок", Text.normalizeRu("за\u0301мок"))
        assertEquals(Text.Script.CYRILLIC, Text.detectScript("12 привет"))
        assertEquals(Text.Script.LATIN, Text.detectScript("hello"))
        assertEquals(Text.Script.OTHER, Text.detectScript("123"))
    }

    private val index = WordIndex.parse("bank\t49\nblue\t49\ncafé\t35\nhello\t49\nhouse\t53\nice cream\t39\nrun\t51\nwalk\t48\n")

    @Test
    fun prefixAndSimilar() {
        assertEquals(listOf("house"), Search.prefixSearch(index, "hou").map { it.key })
        assertEquals(listOf("bank", "blue"), Search.prefixSearch(index, "b").map { it.key })
        assertTrue(index.has("walk"))
        assertEquals("hello", Search.suggestSimilar(index, "helo").first().key)
        assertEquals("walk", Search.suggestSimilar(index, "wlak").first().key) // перестановка соседних букв
        assertEquals(1, Search.editDistance("ab", "ba", 2))
    }

    @Test
    fun parsesEntryWithMixedTranslationTerms() {
        val json = """{"w":"café","z":35,"m":[{"t":"noun","s":[{"d":"A coffeehouse."}]}],
            "tr":[{"pos":"noun","g":"coffeehouse","t":[{"w":"кафе","x":"n"},"кофейня"]}],"rel":{"syn":["x"]}}"""
        val e = EntryParse.entry(Json.parseToJsonElement(json) as JsonObject)
        assertNotNull(e)
        assertEquals("кафе", e!!.tr[0].t[0].w)
        assertEquals("n", e.tr[0].t[0].x)
        assertEquals("кофейня", e.tr[0].t[1].w)
        assertEquals(listOf("кафе", "кофейня"), EntryUtil.topTranslations(e.tr, 4))
    }

    @Test
    fun topTranslationsTakesOnePerSenseFirst() {
        val json = """{"w":"bank","tr":[{"pos":"noun","t":["банк","учреждение"]},{"pos":"noun","t":["берег"]}]}"""
        val e = EntryParse.entry(Json.parseToJsonElement(json) as JsonObject)!!
        assertEquals(listOf("банк", "берег", "учреждение"), EntryUtil.topTranslations(e.tr, 3))
    }

    @Test
    fun wordOfTheDayIsStableAndInRange() {
        val d = LocalDate.of(2026, 11, 6)
        assertEquals(EntryUtil.wordOfTheDay(0, d), EntryUtil.wordOfTheDay(0, d))
        assertTrue(EntryUtil.wordOfTheDay(-5, d) in EntryUtil.WORDS_OF_THE_DAY)
    }
}
