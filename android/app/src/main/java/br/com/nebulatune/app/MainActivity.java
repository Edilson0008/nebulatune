package br.com.nebulatune.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(MediaImporterPlugin.class);
        registerPlugin(MediaNotificationPlugin.class);
        registerPlugin(SleepTimerPlugin.class);
        super.onCreate(savedInstanceState);
        BackgroundUpdater.schedule(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        BackgroundUpdater.reschedule(this);
        UpdateAlarmReceiver.checkNow(this);
    }
}
