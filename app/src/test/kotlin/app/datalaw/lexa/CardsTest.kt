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
import app.datalaw.lexa.core.Pron
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

    @Test
    fun hintHasTranscriptionPartOfSpeechAndShortDefinition() {
        val e = Entry(
            "suggest", 50, p = listOf(Pron("/səˈdʒɛst/", "us"), Pron("/səˈdʒest/", "uk")),
            m = listOf(Meaning("verb", listOf(Sense("To propose a plan."))), Meaning("noun", listOf(Sense("A thing.")))),
        )
        assertEquals("/səˈdʒɛst/ · глагол\nTo propose a plan", CardLogic.hint(e, verb = true, accent = "us"))
        assertEquals("/səˈdʒest/ · глагол\nTo propose a plan", CardLogic.hint(e, verb = true, accent = "uk"))
    }

    @Test
    fun hintTrimsLongDefinitionAndSurvivesMissingData() {
        val long = "x".repeat(200)
        val e = Entry("w", 40, m = listOf(Meaning("noun", listOf(Sense(long)))))
        val lines = CardLogic.hint(e, verb = false, accent = "us").lines()
        assertEquals("существительное", lines[0])
        assertTrue(lines[1].length <= 80 && lines[1].endsWith("…"))
        assertEquals("", CardLogic.hint(Entry("w"), verb = false, accent = "us"))
    }

    @Test
    fun generatedCardCarriesHint() {
        assertEquals("глагол\nTo propose", generate("suggest").hint)
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
        assertEquals(listOf("to suggest"), WordListParser.parseFile("d.json", """{"cards":[{"front":"to suggest","back":"x"}]}"""))
    }

    /* ───── формат колоды (DL Studio) ───── */

    private val cards = listOf(
        DeckCard("to suggest", "предлагать", "/səˈdʒɛst/ · глагол\nTo put forward", "Она предложила это.", "She suggested it."),
    )

    @Test
    fun parsesDlStudioDecksAsWordLists() {
        val deck = """{"name":"Английский","items":[{"name":"B1","items":[{"name":"to give up","back":"сдаться"},{"name":"apple","back":"яблоко"}]}]}"""
        assertEquals(listOf("to give up", "apple"), WordListParser.parseFile("d.json", deck))
    }

    @Test
    fun createsProjectDeckCardsTree() {
        val text = DeckIo.create("Моя колода", cards)
        val project = Json.parseToJsonElement(text) as JsonObject
        assertEquals(listOf("name", "items"), project.keys.toList())
        assertEquals("Английский", project["name"]!!.jsonPrimitive.content)
        val deck = (project["items"] as JsonArray)[0] as JsonObject
        assertEquals("Моя колода", deck["name"]!!.jsonPrimitive.content)
        val card = (deck["items"] as JsonArray)[0] as JsonObject
        assertEquals(listOf("name", "back", "hint", "explanation", "example"), card.keys.toList())
        assertEquals("to suggest", card["name"]!!.jsonPrimitive.content)
        assertEquals("She suggested it.", card["example"]!!.jsonPrimitive.content)
        assertTrue(text.contains("\"name\": \"Английский\"")) // кириллица не экранируется, отступ 2 пробела
    }

    @Test
    fun emptyCardFieldsAreNotWritten() {
        val text = DeckIo.create("D", listOf(DeckCard("cat", "кот", "", "", "")))
        assertFalse(text.contains("\"hint\""))
        assertFalse(text.contains("\"example\""))
        assertFalse(text.contains("\"explanation\""))
    }

    @Test
    fun mergeAppendsToTheFirstDeckAndKeepsEverythingElse() {
        val base = """{"name":"Проект","tag":1,"items":[
            {"name":"Старая","extra":true,"items":[{"name":"to bring up","back":"затронуть","mark":"x"}]},
            {"name":"Другая","items":[{"name":"dog","back":"собака"}]}]}"""
        val b = DeckIo.parse(base)
        assertNotNull(b)
        assertEquals("Старая", b!!.name)
        assertEquals(1, b.cardCount)
        assertTrue("bring up" in b.keys)
        assertTrue("dog" in b.keys) // дубликаты ищем по всему файлу
        val merged = Json.parseToJsonElement(DeckIo.merge(b, "Новая", cards)) as JsonObject
        assertEquals("1", merged["tag"]!!.jsonPrimitive.content)
        val decks = merged["items"] as JsonArray
        assertEquals(2, decks.size)
        val first = decks[0] as JsonObject
        assertEquals("Новая", first["name"]!!.jsonPrimitive.content)
        assertEquals("true", first["extra"]!!.jsonPrimitive.content)
        val list = first["items"] as JsonArray
        assertEquals(2, list.size)
        assertEquals("x", ((list[0] as JsonObject)["mark"]!!).jsonPrimitive.content)
        assertEquals("to suggest", ((list[1] as JsonObject)["name"]!!).jsonPrimitive.content)
    }

    @Test
    fun mergeWorksOnAFlatDeckWithSynonymKeys() {
        val b = DeckIo.parse("""{"name":"Плоская","cards":[{"front":"cat","translation":"кот"}]}""")
        assertNotNull(b)
        val merged = Json.parseToJsonElement(DeckIo.merge(b!!, "Плоская", cards)) as JsonObject
        assertEquals(2, (merged["cards"] as JsonArray).size)
    }

    @Test
    fun rejectsForeignJson() {
        assertNull(DeckIo.parse("not json"))
        assertNull(DeckIo.parse("\"just a string\""))
        assertNull(DeckIo.parse("""{"format":"flashcards-deck","cards":[{"front":"a","back":"b"}]}""")) // нет названия колоды
        assertNull(DeckIo.parse("""{"name":"x"}"""))
    }
}
