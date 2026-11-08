package app.datalaw.lexa.cards

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Существующая колода DL Studio, к которой дописываются новые карточки. */
class BaseDeck(
    val root: JsonElement,
    val name: String,
    val cardCount: Int,
    /** ключи (CardLogic.dedupKey) всех карточек файла */
    val keys: Set<String>,
)

/**
 * Файлы колод в формате импорта DL Studio: дерево `{name, items:[…]}` — проект → колода → карточки.
 * У карточки: `name` (слово), `back` (перевод), `hint`, `explanation`, `example`; пустые поля не пишутся.
 * Импортируется на любом уровне («проекты», «проект», «колода»).
 */
@OptIn(ExperimentalSerializationApi::class)
object DeckIo {
    /** Название проекта в созданном файле. */
    const val PROJECT = "Английский"

    private val CHILD_KEYS = listOf("items", "decks", "cards")

    private val pretty = Json {
        prettyPrint = true
        prettyPrintIndent = "  "
    }

    private fun render(root: JsonElement): String = pretty.encodeToString(JsonElement.serializer(), root) + "\n"

    private fun card(c: DeckCard): JsonObject = buildJsonObject {
        put("name", c.front)
        put("back", c.back)
        if (c.hint.isNotBlank()) put("hint", c.hint)
        if (c.explanation.isNotBlank()) put("explanation", c.explanation)
        if (c.example.isNotBlank()) put("example", c.example)
    }

    /** Новая колода: проект «Английский» → колода [deckName] → карточки. */
    fun create(deckName: String, cards: List<DeckCard>): String = render(
        buildJsonObject {
            put("name", PROJECT)
            put("items", buildJsonArray {
                add(buildJsonObject {
                    put("name", deckName)
                    put("items", JsonArray(cards.map(::card)))
                })
            })
        },
    )

    /* ───────── Чтение существующего файла ───────── */

    private fun prim(e: JsonElement?): String? = (e as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

    private fun childKey(o: JsonObject): String? = CHILD_KEYS.firstOrNull { o[it] is JsonArray }

    /** Узел без вложенных списков — карточка. */
    private fun isCard(o: JsonObject): Boolean = childKey(o) == null

    private fun cardName(o: JsonObject): String? = prim(o["name"]) ?: prim(o["front"])

    private fun objects(a: JsonArray): List<JsonObject> = a.filterIsInstance<JsonObject>()

    /** Колода — узел, где лежат одни карточки (или пусто); ищем первую сверху вниз. */
    private fun findDeck(e: JsonElement): JsonObject? = when (e) {
        is JsonArray -> objects(e).firstNotNullOfOrNull(::findDeck)
        is JsonObject -> childKey(e)?.let { key ->
            val kids = objects(e[key] as JsonArray)
            if (kids.all(::isCard)) e else kids.firstNotNullOfOrNull(::findDeck)
        }
        else -> null
    }

    private fun allCards(e: JsonElement): List<JsonObject> = when (e) {
        is JsonArray -> objects(e).flatMap(::allCards)
        is JsonObject -> if (isCard(e)) listOf(e) else CHILD_KEYS.flatMap { k -> (e[k] as? JsonArray)?.let(::allCards).orEmpty() }
        else -> emptyList()
    }

    /** null — это не файл колоды DL Studio (нет колоды с названием). */
    fun parse(text: String): BaseDeck? {
        val root = runCatching { Json.parseToJsonElement(text.trimStart('\uFEFF')) }.getOrNull() ?: return null
        if (root !is JsonObject && root !is JsonArray) return null
        val deck = findDeck(root) ?: return null
        val name = prim(deck["name"]) ?: prim(deck["front"])
        if (name.isNullOrBlank()) return null
        val own = (deck[childKey(deck)!!] as JsonArray).size
        val keys = allCards(root).mapNotNull(::cardName).map(CardLogic::dedupKey).toSet()
        return BaseDeck(root, name, own, keys)
    }

    /** Дописывает карточки в первую колоду дерева; всё остальное (порядок ключей, неизвестные поля) сохраняется. */
    private fun append(e: JsonElement, deckName: String, cards: List<JsonObject>): JsonElement? = when (e) {
        is JsonArray -> e.indices.firstNotNullOfOrNull { i ->
            (e[i] as? JsonObject)?.let { append(it, deckName, cards) }?.let { new -> JsonArray(e.toMutableList().also { l -> l[i] = new }) }
        }
        is JsonObject -> childKey(e)?.let { key ->
            val list = e[key] as JsonArray
            if (objects(list).all(::isCard)) {
                JsonObject(LinkedHashMap(e).also { m ->
                    m[key] = JsonArray(list + cards)
                    m["name"] = JsonPrimitive(deckName)
                })
            } else {
                append(list, deckName, cards)?.let { new -> JsonObject(LinkedHashMap(e).also { m -> m[key] = new }) }
            }
        }
        else -> null
    }

    /** Дописывает карточки в существующую колоду; меняется только её название. */
    fun merge(base: BaseDeck, deckName: String, cards: List<DeckCard>): String =
        render(append(base.root, deckName, cards.map(::card)) ?: base.root)
}
