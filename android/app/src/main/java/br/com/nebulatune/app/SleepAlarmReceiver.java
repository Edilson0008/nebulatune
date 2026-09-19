package br.com.nebulatune.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class SleepAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(final Context context, Intent intent) {
        if (!SleepTimerPlugin.ACTION_FIRE.equals(intent.getAction())) return;
        final Activity activity = SleepTimerPlugin.activityRef;
        if (activity == null || activity.isDestroyed()) return;
        activity.runOnUiThread(() -> {
            if (activity instanceof BridgeActivity) {
                Bridge bridge = ((BridgeActivity) activity).getBridge();
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript(
                        "window.__nebulaSleepPause ? window.__nebulaSleepPause() : null", null);
                }
            }
        });
    }
}