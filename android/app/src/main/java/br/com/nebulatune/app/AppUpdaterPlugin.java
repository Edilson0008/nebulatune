package br.com.nebulatune.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    public static final String UPDATE_CHANNEL_ID = "nebulatune_updates";

    @PluginMethod
    public void requestNotificationsPermission(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            String perm = Manifest.permission.POST_NOTIFICATIONS;
            if (ContextCompat.checkSelfPermission(getContext(), perm) != PackageManager.PERMISSION_GRANTED) {
                String[] perms = { perm };
                ActivityCompat.requestPermissions(getActivity(), perms, 1001);
                call.resolve();
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void notifyUpdate(PluginCall call) {
        String title = call.getString("title", "Atualização disponível");
        String body = call.getString("body", "Há uma nova versão do NebulaTune para instalar.");
        String tag = call.getString("tag", "update");
        int id = Math.abs(tag.hashCode());

        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(
                android.content.Context.NOTIFICATION_SERVICE
            );
            if (nm == null) {
                call.reject("sem gerenciador de notificações");
                return;
            }

            if (android.os.Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(UPDATE_CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    UPDATE_CHANNEL_ID,
                    "Atualizações do NebulaTune",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Avisa quando houver versão nova do app");
                nm.createNotificationChannel(channel);
            }

            Intent tap = new Intent(getContext(), getActivity().getClass());
            tap.putExtra("fromUpdateNotification", true);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent contentIntent = PendingIntent.getActivity(getContext(), id, tap, flags);

            Notification notification = new NotificationCompat.Builder(getContext(), UPDATE_CHANNEL_ID)
                .setSmallIcon(br.com.nebulatune.app.R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .build();

            nm.notify(id, notification);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "falha na notificação" : e.getMessage());
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("url obrigatoria");
            return;
        }

        new Thread(() -> {
            try {
                File dir = getContext().getExternalFilesDir(null);
                if (dir == null) {
                    dir = getContext().getCacheDir();
                }
                File apk = new File(dir, "nebulatune-update.apk");

                HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(60000);
                conn.connect();

                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    throw new Exception("HTTP " + code);
                }

                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = in.read(buffer)) > 0) {
                        out.write(buffer, 0, read);
                    }
                }

                Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk
                );

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "falha ao baixar" : e.getMessage());
            }
        }).start();
    }
}
