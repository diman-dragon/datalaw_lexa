package __PKG__;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LexaSpeechPlugin.class);
        registerPlugin(LexaVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
