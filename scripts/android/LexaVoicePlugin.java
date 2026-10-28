package __PKG__;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Голосовой ввод: системная служба распознавания речи (android.speech.SpeechRecognizer).
 * JS: registerPlugin("LexaVoice")
 *   available() → { value }
 *   start({ lang, preferOffline }) — резолвится, когда запись началась; дальше события:
 *     state   { phase: "listening" | "processing" }
 *     level   { value: 0..1 }            громкость голоса
 *     partial { text }                   промежуточный результат
 *     final   { alternatives: string[] } итог (лучший вариант первым)
 *     error   { code, message }          PERMISSION | UNAVAILABLE | NETWORK | NO_SPEECH | LANG | BUSY | FAILED
 *   stop() — закончить запись и выдать результат; cancel() — прервать без результата.
 * SpeechRecognizer обязан жить в главном потоке — всё выполняется через runOnUiThread.
 */
@CapacitorPlugin(
    name = "LexaVoice",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class LexaVoicePlugin extends Plugin {
    private SpeechRecognizer recognizer;
    /** Идёт ли сессия: после cancel() запоздалые колбэки (ERROR_CLIENT и т.п.) игнорируем. */
    private boolean active = false;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("value", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition unavailable", "UNAVAILABLE");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Microphone permission denied", "PERMISSION");
        }
    }

    private void begin(final PluginCall call) {
        final String lang = call.getString("lang", "en-US");
        final boolean offline = call.getBoolean("preferOffline", true);
        getActivity().runOnUiThread(() -> {
            try {
                destroyRecognizer();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(listener);
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, offline);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                active = true;
                recognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                active = false;
                destroyRecognizer();
                call.reject("Could not start recognition", "FAILED");
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null && active) {
                try {
                    recognizer.stopListening();
                } catch (Exception ignored) {}
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            active = false;
            destroyRecognizer();
            call.resolve();
        });
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try {
                recognizer.cancel();
                recognizer.destroy();
            } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private void emit(String event, JSObject data) {
        notifyListeners(event, data);
    }

    private void emitState(String phase) {
        JSObject o = new JSObject();
        o.put("phase", phase);
        emit("state", o);
    }

    private void emitError(String code, String message) {
        active = false;
        JSObject o = new JSObject();
        o.put("code", code);
        o.put("message", message);
        emit("error", o);
    }

    private static String mapError(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "NO_SPEECH";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
                return "NETWORK";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "PERMISSION";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "BUSY";
            case 12: // ERROR_LANGUAGE_NOT_SUPPORTED (API 31)
            case 13: // ERROR_LANGUAGE_UNAVAILABLE (API 31)
                return "LANG";
            default: // ERROR_AUDIO, ERROR_CLIENT и прочее
                return "FAILED";
        }
    }

    private static ArrayList<String> texts(Bundle bundle) {
        ArrayList<String> list = bundle == null ? null : bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null ? new ArrayList<>() : list;
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {
            if (active) emitState("listening");
        }

        @Override
        public void onBeginningOfSpeech() {}

        @Override
        public void onRmsChanged(float rmsdB) {
            if (!active) return;
            // rmsdB ≈ −2…10 → 0…1
            float v = Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f));
            JSObject o = new JSObject();
            o.put("value", v);
            emit("level", o);
        }

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {
            if (active) emitState("processing");
        }

        @Override
        public void onError(int error) {
            if (!active) return;
            emitError(mapError(error), "SpeechRecognizer error " + error);
        }

        @Override
        public void onResults(Bundle results) {
            if (!active) return;
            active = false;
            ArrayList<String> list = texts(results);
            JSArray alts = new JSArray();
            for (String s : list) alts.put(s);
            JSObject o = new JSObject();
            o.put("alternatives", alts);
            emit("final", o);
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            if (!active) return;
            ArrayList<String> list = texts(partialResults);
            if (list.isEmpty()) return;
            JSObject o = new JSObject();
            o.put("text", list.get(0));
            emit("partial", o);
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}
    };

    @Override
    protected void handleOnDestroy() {
        active = false;
        if (getActivity() != null) {
            getActivity().runOnUiThread(this::destroyRecognizer);
        } else {
            destroyRecognizer();
        }
    }
}
