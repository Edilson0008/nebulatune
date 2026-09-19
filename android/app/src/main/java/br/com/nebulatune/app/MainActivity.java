package br.com.nebulatune.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(MediaImporterPlugin.class);
        registerPlugin(MediaNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
