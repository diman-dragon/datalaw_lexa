package app.datalaw.lexa.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * Общий кегль для нескольких подписей: если самая длинная не помещается, уменьшаются все сразу,
 * чтобы ряд (например, нижняя панель) выглядел ровно.
 */
@Stable
class FitGroup(start: TextUnit) {
    var size: TextUnit by mutableStateOf(start)
}

@Composable
fun rememberFitGroup(start: TextUnit, vararg keys: Any?): FitGroup = remember(start, *keys) { FitGroup(start) }

/**
 * Подпись в одну строку: слова не переносятся и не обрезаются, при нехватке места кегль плавно
 * уменьшается (до [minSize]). С [group] — общий кегль для всей группы подписей.
 */
@Composable
fun FitText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = 14.sp,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    textAlign: TextAlign? = null,
    minSize: TextUnit = 9.sp,
    group: FitGroup? = null,
) {
    var own by remember(text, fontSize) { mutableStateOf(fontSize) }
    val size = group?.size ?: own
    Text(
        text = text,
        modifier = modifier,
        color = color,
        fontSize = size,
        fontWeight = fontWeight,
        fontFamily = fontFamily,
        letterSpacing = letterSpacing,
        textAlign = textAlign,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Clip,
        onTextLayout = { r ->
            if (r.didOverflowWidth && size > minSize) {
                val next = (size.value * 0.92f).coerceAtLeast(minSize.value).sp
                if (group != null) group.size = next else own = next
            }
        },
    )
}
