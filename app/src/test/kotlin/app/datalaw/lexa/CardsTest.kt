package app.datalaw.lexa

import app.datalaw.lexa.cards.CardGenerator
import app.datalaw.lexa.cards.CardLogic
import app.datalaw.lexa.cards.CardStatus
import app.datalaw.lexa.cards.DeckCard
import app.datalaw.lexa.cards.DeckIo
import app.datalaw.lexa.cards.GenOptions
import app.datalaw.lexa.cards.WordListParser
import app.datalaw.lexa.core.Entry
import app.datalaw.lexa.core.Meaning
import app.datalaw.lexa.core.Sense
import app.datalaw.lexa.core.SentencePair
import app.datalaw.lexa.core.TrGroup
import app.datalaw.lexa.core.TrTerm
import app.datalaw.lexa.core.WordIndex
import app.datalaw.lexa.data.DictionarySource
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeDict : DictionarySource {
    val entries = mapOf(
        "suggest" to Entry(
            "suggest", 50, m = listOf(Meaning("verb", listOf(Sense("To propose.", e = listOf("I suggest a walk."))))),
            tr = listOf(TrGroup("verb", "propose", listOf(TrTerm("предлагать"), TrTerm("советовать"))), TrGroup("verb", "imply", listOf(TrTerm("намекать")))),
        ),
        "run" to Entry(
            "run", 51, m = listOf(Meaning("verb", listOf(Sense("To move."))), Meaning("noun", listOf(Sense("A jog.")))),
            tr = listOf(TrGroup("verb", "move", listOf(TrTerm("бегать"))), TrGroup("noun", "jog", listOf(TrTerm("пробежка")))),
        ),
        "ran" to Entry("ran", 45, r = listOf("run"), rg = "simple past of run"),
        "ghost" to Entry("ghost", 40, m = listOf(Meaning("noun", listOf(Sense("A spirit."))))),
        "house" to Entry("house", 53, m = listOf(Meaning("noun", listOf(Sense("A building."))))
            , tr = listOf(TrGroup("noun", "building", listOf(TrTerm("дом"))))),
    )
    val sentences = mapOf(
        "suggest" to listOf(SentencePair("She suggested going out for dinner tonight.", "Она предложила сходить поужинать.")),
        "run" to listOf(
            SentencePair("I run every morning before work starts.", "Я бегаю каждое утро."),
            SentencePair("He ran to the station as fast as he could.", "Он побежал на станцию."),
        ),
    )
    val reverse = mapOf("бег" to listOf("run", "running"))

    override suspend fun getEntry(key: String) = entries[key]
    override suspend fun getReverse(key: String) = reverse[key] ?: emptyList()
    override suspend fun getSentences(key: String) = sentences[key] ?: emptyList()
    override suspend fun enIndex() = WordIndex.parse(entries.keys.sorted().joinToString("\n") { "$it\t50" } + "\n")
}

class CardsTest {
    private val gen = CardGenerator(FakeDict())
    private fun generate(s: String, o: GenOptions = GenOptions()) = runBlocking { gen.generate(s, o) }

    @Test
    fun candidateKeys() {
        assertEquals(listOf("to suggest", "suggest"), CardLogic.candidateKeys("To suggest"))
        assertEquals(listOf("the house", "house"), CardLogic.candidateKeys("The house"))
        assertEquals("suggest", CardLogic.dedupKey("to Suggest."))
    }

    @Test
    fun verbOnlyWordGetsToAndExampleWithTranslation() {
        val r = generate("suggest")
        assertEquals(CardStatus.READY, r.status)
        assertEquals("to suggest", r.front)
        assertEquals("предлагать, намекать, советовать".split(", ").toSet(), r.back.split(", ").toSet())
        assertEquals("She suggested going out for dinner tonight.", r.alternatives.first().en)
        assertEquals("Она предложила сходить поужинать.", r.alternatives.first().ru)
    }

    @Test
    fun addToCanBeDisabledAndUserToIsKept() {
        assertEquals("suggest", generate("suggest", GenOptions(addTo = false)).front)
        assertEquals("to suggest", generate("to suggest").front)
    }

    @Test
    fun ambiguousPosDoesNotGetTo() {
        assertEquals("run", generate("run").front)
    }

    @Test
    fun toPrefixPrefersVerbTranslations() {
        // «to run»: ключ «to run» нет, берём «run»; переводы — только глагольные
        val r = generate("to run")
        assertEquals("бегать", r.back)
    }

    @Test
    fun formFollowsLemma() {
        val r = generate("ran")
        assertEquals(CardStatus.READY, r.status)
        assertEquals("run", r.via)
        assertEquals("ran", r.front)
        // предложение с той формой слова, что ввёл пользователь, идёт первым
        assertTrue(r.alternatives.first().en.contains("ran"))
    }

    @Test
    fun missingTranslationAndMissingWord() {
        assertEquals(CardStatus.NO_TRANSLATION, generate("ghost").status)
        val nf = generate("hous")
        assertEquals(CardStatus.NOT_FOUND, nf.status)
        assertTrue("house" in nf.suggestions)
    }

    @Test
    fun russianInputSuggestsEnglish() {
        val r = generate("бег")
        assertEquals(CardStatus.NOT_FOUND, r.status)
        assertTrue(r.suggestionsAreTranslations)
        assertEquals(listOf("run", "running"), r.suggestions)
    }

    @Test
    fun dictionaryExampleWithoutTranslationIsFallback() {
        val ex = CardLogic.chooseExamples(emptyList(), listOf("I suggest a walk."), "suggest")
        assertEquals("", ex.single().ru)
        assertEquals("I suggest a walk.", ex.single().en)
    }

    /* ───── список слов ───── */

    @Test
    fun parsesPastedText() {
        val words = WordListParser.parseText("1. apple\n- Banana; cherry\n# comment\n\napple\n\"to give up\"")
        assertEquals(listOf("apple", "Banana", "cherry", "to give up"), words)
    }

    @Test
    fun parsesCsvWithHeaderAndQuotes() {
        val csv = "word,translation\n\"ice cream\",мороженое\nbank;банк\nhouse\tдом\n"
        assertEquals(listOf("ice cream", "bank", "house"), WordListParser.parseFile("list.csv", csv))
    }

    @Test
    fun parsesJsonArraysAndDecks() {
        assertEquals(listOf("a", "b"), WordListParser.parseFile("w.json", """["a","b","A"]"""))
        assertEquals(listOf("to suggest"), WordListParser.parseFile("d.json", """{"format":"flashcards-deck","cards":[{"front":"to suggest","back":"x"}]}"""))
    }

    /* ───── формат колоды ───── */

    private val cards = listOf(DeckCard("to suggest", "предлагать", "She suggested it.", "Она предложила это."))

    @Test
    fun createsDeckInTheSameFormat() {
        val text = DeckIo.create("Моя колода", cards)
        val o = Json.parseToJsonElement(text) as JsonObject
        assertEquals(listOf("format", "version", "language", "deck", "cards"), o.keys.toList())
        assertEquals("flashcards-deck", o["format"]!!.jsonPrimitive.content)
        assertEquals("1", o["version"]!!.jsonPrimitive.content)
        val card = (o["cards"] as JsonArray)[0] as JsonObject
        assertEquals(listOf("front", "back", "example", "example_translation"), card.keys.toList())
        assertTrue(text.contains("\"name\": \"Английский\"")) // кириллица не экранируется, отступ 2 пробела
        assertTrue(text.contains("\n  \"format\""))
    }

    @Test
    fun mergeKeepsExistingContentAndAppends() {
        val base = """{"format":"flashcards-deck","version":1,"language":{"name":"Английский","tts":"en-US"},
            "deck":{"name":"Старая","extra":true},"cards":[{"front":"to bring up","back":"затронуть","example":"e","example_translation":"p","tag":"x"}],"custom":5}"""
        val b = DeckIo.parse(base)
        assertNotNull(b)
        assertEquals(1, b!!.cardCount)
        assertTrue("bring up" in b.keys)
        val merged = Json.parseToJsonElement(DeckIo.merge(b, "Новая", cards)) as JsonObject
        assertEquals("5", merged["custom"]!!.jsonPrimitive.content)
        assertEquals("Новая", ((merged["deck"] as JsonObject)["name"]!!).jsonPrimitive.content)
        assertEquals("true", ((merged["deck"] as JsonObject)["extra"]!!).jsonPrimitive.content)
        val list = merged["cards"] as JsonArray
        assertEquals(2, list.size)
        assertEquals("x", ((list[0] as JsonObject)["tag"]!!).jsonPrimitive.content)
        assertEquals("to suggest", ((list[1] as JsonObject)["front"]!!).jsonPrimitive.content)
    }

    @Test
    fun rejectsForeignJson() {
        assertNull(DeckIo.parse("""{"format":"other","cards":[]}"""))
        assertNull(DeckIo.parse("not json"))
        assertFalse(DeckIo.parse("""{"format":"flashcards-deck","cards":[]}""") == null)
    }
}
