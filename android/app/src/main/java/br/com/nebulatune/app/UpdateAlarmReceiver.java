package br.com.nebulatune.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class UpdateAlarmReceiver extends BroadcastReceiver {

    static final String ACTION_CHECK = "br.com.nebulatune.app.CHECK_UPDATE";
    private static final String PREFS = "nebulatune_bg_updates";
    private static final String SITE =
        "https://edilson0008.github.io/nebulatune/version.json";
    private static final int NOTIFICATION_ID = 4042;

    public static void checkNow(Context context) {
        new Thread(() -> new UpdateAlarmReceiver().check(context)).start();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (android.content.Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
            BackgroundUpdater.schedule(context);
            SleepTimerPlugin.rescheduleAfterRestart(context);
            return;
        }
        if (!ACTION_CHECK.equals(action)) return;

        BackgroundUpdater.reschedule(context);
        new Thread(() -> check(context)).start();
    }

    private void check(Context context) {
        try {
            String remote = fetchRemoteVersion();
            if (remote == null) return;
            String local = null;
            try {
                local = context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionName;
            } catch (Exception ignored) {
            }
            if (local == null || compareVersions(remote, local) <= 0) return;

            SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String already = sp.getString("last_notified_version", "");
            if (remote.equals(already)) return;
            sp.edit().putString("last_notified_version", remote).apply();

            if (android.os.Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            notifyNewVersion(context, remote);
        } catch (Exception e) {
            Log.w("UpdateAlarm", "falha na checagem: " + e.getMessage());
        }
    }

    private String fetchRemoteVersion() throws Exception {
        HttpURLConnection conn =
            (HttpURLConnection) new URL(SITE).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestProperty("Cache-Control", "no-cache");
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) return null;
        BufferedReader br = new BufferedReader(
            new InputStreamReader(conn.getInputStream(), "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) {
            sb.append(line);
        }
        return new JSONObject(sb.toString()).optString("version", null);
    }

    private static int[] parse(String v) {
        String[] parts = v.trim().split("\\.");
        int[] out = { 0, 0, 0 };
        for (int i = 0; i < Math.min(3, parts.length); i++) {
            try {
                out[i] = Integer.parseInt(parts[i].replaceAll("\\D", ""));
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    static int compareVersions(String a, String b) {
        int[] x = parse(a);
        int[] y = parse(b);
        for (int i = 0; i < 3; i++) {
            if (x[i] != y[i]) {
                return Integer.compare(x[i], y[i]);
            }
        }
        return 0;
    }

    private void notifyNewVersion(Context context, String version) {
        String title = "NebulaTune " + version + " disponível";
        String body = "Há uma versão nova do app. Abra o NebulaTune para atualizar.";
        NotificationManager nm = (NotificationManager) context.getSystemService(
            Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (android.os.Build.VERSION.SDK_INT >= 26
            && nm.getNotificationChannel(AppUpdaterPlugin.UPDATE_CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                AppUpdaterPlugin.UPDATE_CHANNEL_ID,
                "Atualizações do NebulaTune",
                NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Avisa quando houver versão nova do app");
            nm.createNotificationChannel(channel);
        }

        Intent tap = new Intent(context, MainActivity.class);
        tap.putExtra("fromUpdateNotification", true);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent content = PendingIntent.getActivity(context, NOTIFICATION_ID, tap, flags);

        Notification n = new NotificationCompat.Builder(context, AppUpdaterPlugin.UPDATE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(content)
            .build();
        nm.notify(NOTIFICATION_ID, n);
    }
}