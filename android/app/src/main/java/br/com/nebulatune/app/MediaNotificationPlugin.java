package br.com.nebulatune.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaNotification")
public class MediaNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "nebulatune_media";
    private static final int NOTIF_ID = 40170;

    private static volatile MediaNotificationPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void updateNowPlaying(PluginCall call) {
        try {
            String title = call.getString("title", "");
            String artist = call.getString("artist", "");
            String album = call.getString("album", "");
            boolean playing = call.getBoolean("playing", false);
            int position = call.getInt("position", 0);
            int duration = call.getInt("duration", 0);

            int[] colors = readColors(call);

            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "NebulaTune — música tocando",
                    NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("A faixa atual com controles");
                nm.createNotificationChannel(channel);
            }

            NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(br.com.nebulatune.app.R.drawable.ic_notification)
                .setLargeIcon(gradientCover(colors))
                .setContentTitle(title)
                .setContentText(artist + (album != null && !album.isEmpty() ? " · " + album : ""))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(prevPending())
                .addAction(togglePending(playing))
                .addAction(nextPending());
            if (duration > 0) {
                b.setProgress((int) duration, (int) Math.min(position, duration), false);
            }

            nm.notify(NOTIF_ID, b.build());
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "não consegui montar a notificação" : e.getMessage());
        }
    }

    @PluginMethod
    public void hideNowPlaying(PluginCall call) {
        try {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(NOTIF_ID);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "não consegui esconder a notificação" : e.getMessage());
        }
    }

    private int[] readColors(PluginCall call) {
        JSObject colors = call.getObject("colors");
        if (colors == null) return null;
        try {
            int[] out = new int[3];
            out[0] = (Integer) colors.get("c1");
            out[1] = (Integer) colors.get("c2");
            out[2] = (Integer) colors.get("c3");
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private Bitmap gradientCover(int[] colors) {
        int size = 512;
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint paint = new Paint();
        if (colors != null && colors.length == 3) {
            paint.setShader(new LinearGradient(0, 0, size, size, colors[0], colors[2], Shader.TileMode.CLAMP));
        } else {
            paint.setColor(Color.rgb(94, 34, 168));
        }
        canvas.drawRect(0, 0, size, size, paint);
        return bmp;
    }

    private NotificationCompat.Action prevPending() {
        return controlAction("prev", "Anterior");
    }

    private NotificationCompat.Action togglePending(boolean playing) {
        return controlAction(playing ? "pause" : "play", playing ? "Pausar" : "Tocar");
    }

    private NotificationCompat.Action nextPending() {
        return controlAction("next", "Próxima");
    }

    private NotificationCompat.Action controlAction(String action, String label) {
        Intent intent = new Intent(getContext(), MediaButtonReceiver.class);
        intent.setAction("br.com.nebulatune.app.MEDIA_" + action.toUpperCase());
        intent.putExtra("action", action);
        intent.setPackage(getContext().getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(getContext(), action.hashCode(), intent, flags);
        int icon = action.equals("prev") ? android.R.drawable.ic_media_previous
            : action.equals("next") ? android.R.drawable.ic_media_next
            : action.equals("pause") ? android.R.drawable.ic_media_pause
            : android.R.drawable.ic_media_play;
        return new NotificationCompat.Action.Builder(icon, label, pi).build();
    }

    public static class MediaButtonReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getStringExtra("action");
            if (action == null) return;
            MediaNotificationPlugin p = instance;
            if (p != null) {
                JSObject payload = new JSObject();
                payload.put("action", action);
                p.notifyListeners("mediaAction", payload, false);
            }
        }
    }
}
