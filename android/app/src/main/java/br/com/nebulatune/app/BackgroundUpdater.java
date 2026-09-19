package br.com.nebulatune.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public final class BackgroundUpdater {

    private static final String PREFS = "nebulatune_bg_updates";
    private static final long INTERVAL_MS = 60L * 60 * 1000; // 1 hora
    private static final int REQUEST_CODE = 4041;

    private BackgroundUpdater() {}

    public static void schedule(Context ctx) {
        if (ctx == null) return;
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long last = sp.getLong("last_schedule", 0);
        long now = System.currentTimeMillis();
        if (now - last < INTERVAL_MS) return;
        sp.edit().putLong("last_schedule", now).apply();

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, UpdateAlarmReceiver.class);
        i.setAction(UpdateAlarmReceiver.ACTION_CHECK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQUEST_CODE, i, flags);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, now + INTERVAL_MS, pi);
    }

    public static void reschedule(Context ctx) {
        if (ctx == null) return;
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().remove("last_schedule").apply();
        schedule(ctx);
    }
}