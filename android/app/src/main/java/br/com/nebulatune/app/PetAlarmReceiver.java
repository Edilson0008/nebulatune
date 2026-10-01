package br.com.nebulatune.app;

import android.Manifest;
import android.app.AlarmManager;
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
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Chamadas do gatinho com o app FECHADO.
 *
 * O jeito antigo so avisava quando o app estava aberto, porque quem decidia era
 * o JavaScript da tela -- e tela fechada nao roda JavaScript. Aqui o Android
 * acorda o app sozinho por alarme (funciona com o app morto, sem foreground
 * service e sem bateria gasta em serie), e o proprio receiver aplica o mesmo
 * decaimento que a tela usa. Quando alguma barra cai para o nivel critico, ele
 * manda a notificacao.
 *
 * As taxas e o formato do estado precisam bater com src/lib/pet.js e com o
 * que o App grava em nt.petstats. Se um mudar, o outro tem que mudar junto.
 */
public class PetAlarmReceiver extends BroadcastReceiver {

    static final String ACTION_CHECK = "br.com.nebulatune.app.PET_CHECK";
    private static final String PREFS = "nebulatune_pet_bg";
    private static final String CHANNEL = "pet_bg";
    private static final long INTERVAL_MS = 5L * 60 * 1000; // 5 min
    private static final int REQUEST_CODE = 4051;
    /** Base dos ids de notificacao; cada barra usa NOTIF_BASE + indice. */
    private static final int NOTIF_BASE = 4052;
    /** Abaixo disso a barra e considerada urgente e vale um aviso. */
    private static final double CRITICO = 18.0;

    /** As mesmas de MOOD_DECAY em src/lib/pet.js, por minuto. */
    private static final double DECAY_FULL = 1.6;
    private static final double DECAY_HAPPY = 1.1;
    private static final double DECAY_SLEEP = 1.4;
    private static final double DECAY_CLEAN = 2.0;

    private static final String[] KEYS = {"full", "happy", "sleep", "clean"};
    private static final String[] LABELS = {"Fome", "Carinho", "Sono", "Banho"};
    // Sem emojis aqui de proposito: fonte Java com caractere nao-ASCII depende
    // do encoding do gradle e ja falhou build antes. O emoji vem do bundle.
    private static final int[] EMOJI_RES = {R.array.pet_emoji_fome, R.array.pet_emoji_carinho, R.array.pet_emoji_sono, R.array.pet_emoji_banho};

    /** Curva do decaimento: cheia perto de 100, full rate no meio, suave embaixo. */
    private static double taxa(double valor) {
        if (valor >= 100.0) return 0.55;
        if (valor <= 15.0) return 0.70;
        return 1.0;
    }

    private static double decayOf(String key) {
        if ("full".equals(key)) return DECAY_FULL;
        if ("happy".equals(key)) return DECAY_HAPPY;
        if ("sleep".equals(key)) return DECAY_SLEEP;
        return DECAY_CLEAN;
    }

    /** Agenda o proximo alarme. Idempotente: nao cria alarmes empilhados. */
    public static void schedule(Context ctx) {
        if (ctx == null) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, PetAlarmReceiver.class);
        i.setAction(ACTION_CHECK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQUEST_CODE, i, flags);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + INTERVAL_MS, pi);
    }

    /** Reprograma a partir de agora (usado no boot e ao abrir o app). */
    public static void reschedule(Context ctx) {
        schedule(ctx);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (android.content.Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
            schedule(context);
            return;
        }
        if (!ACTION_CHECK.equals(action)) return;
        // O proximo e agendado ANTES do trabalho: se este alarme morrer no meio,
        // ainda existe um proximo e a cadeia nao para.
        schedule(context);
        try {
            aplicarDecaimento(context);
        } catch (Exception e) {
            Log.w("PetAlarm", "falha no decaimento: " + e.getMessage());
        }
    }

    /**
     * Aplica o decaimento no estado salvo e avisa se alguma barra ficou critica.
     * O estado e o mesmo blob que a tela le (nt.petstats via WebView localStorage),
     * gravado aqui no SharedPreferences da app para nao depender do WebView.
     */
    // throws JSONException: org.json do Android e' checked, e put() lancaria
    // isso. O onReceive jaembrulha esta chamada em try/catch, entao declara e'
    // o suficiente.
    private void aplicarDecaimento(Context context) throws JSONException {
        SharedPreferences sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String bruto = sp.getString("petstats", null);
        if (bruto == null || bruto.trim().isEmpty()) return;

        JSONObject state;
        try {
            state = new JSONObject(bruto);
        } catch (Exception e) {
            return;
        }

        long lt = state.optLong("lt", 0L);
        long agora = System.currentTimeMillis();
        if (lt <= 0L) {
            state.put("lt", agora);
            sp.edit().putString("petstats", state.toString()).apply();
            return;
        }
        double minutos = Math.max(0.0, (agora - lt) / 60000.0);
        if (minutos < 0.01) return;

        // Uma passada so: calculamos o novo valor e, se a barra cruzou o
        // critico agora, ja avisamos. Assim nao precisa guardar o "antes" nem
        // o "depois" em mapas so para comparar duas linhas depois.
        StringBuilder paraAvisar = new StringBuilder();
        boolean mudou = false;
        for (int idx = 0; idx < KEYS.length; idx++) {
            String k = KEYS[idx];
            double cur = state.optDouble(k, 0.0);
            double v = cur - minutos * decayOf(k) * taxa(cur);
            double arredondado = Math.round(v * 10.0) / 10.0;
            if (arredondado < 0.0) arredondado = 0.0;
            if (Math.abs(arredondado - cur) > 0.001) {
                state.put(k, arredondado);
                mudou = true;
            }
            // Avisa so o que cruzou o limite agora (nao repete a cada alarme).
            if (arredondado <= CRITICO && cur > CRITICO) {
                paraAvisar.append(k).append('|');
            }
        }
        state.put("lt", agora);
        if (!mudou) return;
        sp.edit().putString("petstats", state.toString()).apply();

        for (String k : paraAvisar.toString().split("\\|")) {
            if (k.isEmpty()) continue;
            int idx = indexOf(k);
            notificar(context, idx,
                res(context, EMOJI_RES[idx]) + " " + LABELS[idx] + " " + res(context, R.string.pet_barra_baixa),
                res(context, R.string.pet_barra_baixa_corpo));
        }
    }

    private static String res(Context context, int id) {
        try {
            return context.getResources().getString(id);
        } catch (Exception e) {
            return "";
        }
    }

    private static int indexOf(String key) {
        for (int i = 0; i < KEYS.length; i++) {
            if (KEYS[i].equals(key)) return i;
        }
        return 0;
    }

    private void notificar(Context context, int idx, String title, String body) {
        if (android.os.Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (android.os.Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch =
                new NotificationChannel(CHANNEL, "Chamadas do gatinho",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(res(context, R.string.pet_canal_desc));
            nm.createNotificationChannel(ch);
        }
        // O indice (0..3) vira o id: sempre positivo e estavel. Usar
        // hashCode() seria perigoso, Math.abs(Integer.MIN_VALUE) continua
        // negativo e a notificacao sairia com id invalido.
        int notifId = NOTIF_BASE + idx;
        Intent tap = new Intent(context, MainActivity.class);
        tap.putExtra("fromPetNotification", KEYS[idx]);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent content = PendingIntent.getActivity(context, notifId, tap, flags);

        Notification n = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(content)
            .build();
        nm.notify(notifId, n);
    }
}