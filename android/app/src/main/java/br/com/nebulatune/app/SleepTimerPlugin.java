package br.com.nebulatune.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SleepTimer")
public class SleepTimerPlugin extends Plugin {

    static final String ACTION_FIRE = "br.com.nebulatune.app.SLEEP_FIRE";
    private static final String PREFS = "nebulatune_sleep";
    private static final int REQUEST_CODE = 4045;
    static volatile Activity activityRef = null;

    @PluginMethod
    public void start(PluginCall call) {
        activityRef = getActivity();
        Double ts = call.getDouble("timestamp");
        long when = ts == null ? 0 : ts.longValue();
        if (when <= 0) {
            call.reject("timestamp inválido");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putLong("fire_at", when).apply();
        schedule(ctx, when);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Context ctx = getContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(createPendingIntent(ctx));
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove("fire_at").apply();
        call.resolve(new JSObject());
    }

    private static PendingIntent createPendingIntent(Context ctx) {
        Intent i = new Intent(ctx, SleepAlarmReceiver.class);
        i.setAction(ACTION_FIRE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, i, flags);
    }

    private static void schedule(Context ctx, long when) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = createPendingIntent(ctx);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
        }
    }

    static void rescheduleAfterRestart(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long fireAt = sp.getLong("fire_at", 0);
        if (fireAt > System.currentTimeMillis()) {
            schedule(ctx, fireAt);
        } else {
            sp.edit().remove("fire_at").apply();
        }
    }
}