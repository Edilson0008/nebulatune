package br.com.nebulatune.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte entre a tela e o alarme nativo do gatinho (PetAlarmReceiver).
 *
 * A tela chama {@code PetAlarm.sync} para mandar o estado atual das barras.
 * O Android guarda isso e passa a mexer sozinho, com o app fechado. Sem isso a
 * unica forma de notificar era a tela notar a barra baixa, o que so acontece
 * com o app aberto.
 */
@CapacitorPlugin(name = "PetAlarm")
public class PetAlarmPlugin extends Plugin {

    private static final String PREFS = "nebulatune_pet_bg";

    /** Envia o estado das barras e (re)agenda o alarme. */
    @PluginMethod
    public void sync(PluginCall call) {
        Context ctx = getContext();
        String petstats = call.getString("petstats");
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = sp.edit();
        if (petstats != null && !petstats.trim().isEmpty()) {
            ed.putString("petstats", petstats);
        } else {
            ed.remove("petstats");
        }
        ed.apply();
        PetAlarmReceiver.schedule(ctx);
        call.resolve(new JSObject());
    }

    /**
     * Devolve o estado que o alarme decaiu enquanto o app estava fechado.
     *
     * Sem isto o native e a tela teriam dois numeros diferentes para a mesma
     * barra: quem abriu o app veria o valor antigo e pularia de um lado para o
     * outro. A tela chama isto na abertura e adota o que for mais recente.
     */
    @PluginMethod
    public void read(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String bruto = sp.getString("petstats", null);
        JSObject out = new JSObject();
        if (bruto != null && !bruto.trim().isEmpty()) {
            out.put("petstats", bruto);
        }
        call.resolve(out);
    }

    /** Reprograma o alarme sem mexer no estado (usado ao abrir o app). */
    @PluginMethod
    public void schedule(PluginCall call) {
        PetAlarmReceiver.schedule(getContext());
        call.resolve(new JSObject());
    }

    /** Cancela o alarme (usado quando a pessoa nao quer ser perturbada). */
    @PluginMethod
    public void cancel(PluginCall call) {
        Context ctx = getContext();
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            android.app.AlarmManager am =
                (android.app.AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                android.content.Intent i = new android.content.Intent(ctx, PetAlarmReceiver.class);
                i.setAction(PetAlarmReceiver.ACTION_CHECK);
                int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
                flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
                am.cancel(android.app.PendingIntent.getBroadcast(ctx, 4051, i, flags));
            }
        }
        call.resolve(new JSObject());
    }

    @Override
    public void load() {
        // App abrindo: garante o alarme rodando, mesmo depois de um "forcar
        // parada" que o Android pode ter feito para economizar bateria.
        PetAlarmReceiver.schedule(getContext());
    }
}