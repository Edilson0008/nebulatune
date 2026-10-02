package br.com.nebulatune.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(
    name = "MediaImporter",
    permissions = {
        @Permission(alias = "mediaAudio", strings = {"android.permission.READ_MEDIA_AUDIO"}),
        @Permission(alias = "externalStorage", strings = {"android.permission.READ_EXTERNAL_STORAGE"})
    })
public class MediaImporterPlugin extends Plugin {

    private boolean canReadAudio() {
        String perm = Build.VERSION.SDK_INT >= 33
            ? "android.permission.READ_MEDIA_AUDIO"
            : "android.permission.READ_EXTERNAL_STORAGE";
        return ContextCompat.checkSelfPermission(getContext(), perm)
            == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void getTracks(PluginCall call) {
        if (!canReadAudio()) {
            requestPermissionForAlias(
                Build.VERSION.SDK_INT >= 33 ? "mediaAudio" : "externalStorage",
                call,
                "permissionResult");
            return;
        }
        listTracks(call);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        if (canReadAudio()) {
            listTracks(call);
        } else {
            call.reject("Sem permissão para ler as músicas do aparelho. Você pode liberar em Configurações > Permissões.");
        }
    }

    // "Download/Music/" -> "Download/Music". No caminho absoluto
    // ("/storage/emulated/0/Music/x.mp3") sobra so a parte DEPOIS do
    // armazenamento, para nao vazar nome de pasta do aparelho e o caminho
    // mudar entre cartao SD e memoria interna.
    private String lerPasta(String bruto, boolean caminhoRelativo) {
        if (bruto == null) return "";
        String caminho = bruto.trim();
        if (caminho.isEmpty()) return "";
        while (caminho.endsWith("/") || caminho.endsWith("\\")) {
            caminho = caminho.substring(0, caminho.length() - 1);
        }
        if (!caminhoRelativo) {
            int marcador = caminho.indexOf("/0/");
            if (marcador >= 0) caminho = caminho.substring(marcador + 3);
            int sd = caminho.indexOf("/storage/");
            if (sd >= 0) {
                int depois = caminho.indexOf('/', sd + 9);
                caminho = depois >= 0 ? caminho.substring(depois + 1) : "";
            }
        }
        return caminho;
    }

    private void listTracks(PluginCall call) {
        new Thread(() -> {
            try {
                JSArray out = new JSArray();
                Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                // A PASTA de cada faixa. `RELATIVE_PATH` (Android 10+) e o jeito
                // certo de ler isso hoje; `DATA` e o caminho absoluto e serve so
                // para celular mais antigo, porque no Android 10+ ele exige
                // permissao extra. Nos dois casos devolvemos a PASTA
                // ("Download/Music"), e nao o caminho inteiro do aparelho.
                boolean caminhoRelativo = Build.VERSION.SDK_INT >= 29;
                String colunaPasta = caminhoRelativo
                    ? MediaStore.Audio.Media.RELATIVE_PATH
                    : MediaStore.Audio.Media.DATA;
                String[] projection = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    colunaPasta
                };
                try (Cursor cur = getContext().getContentResolver().query(
                        collection, projection, null, null, MediaStore.Audio.Media.TITLE + " ASC")) {
                    if (cur != null) {
                        int idCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                        int titleCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                        int artistCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                        int albumCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                        int durCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                        int pastaCol = cur.getColumnIndex(colunaPasta);
                        while (cur.moveToNext()) {
                            JSObject o = new JSObject();
                            o.put("id", String.valueOf(cur.getLong(idCol)));
                            o.put("title", cur.getString(titleCol));
                            o.put("artist", cur.getString(artistCol));
                            o.put("album", cur.getString(albumCol));
                            o.put("duration", Math.round(cur.getLong(durCol) / 1000.0));
                            o.put("folder", lerPasta(pastaCol >= 0 ? cur.getString(pastaCol) : null, caminhoRelativo));
                            out.put(o);
                        }
                    }
                }
                JSObject res = new JSObject();
                res.put("tracks", out);
                call.resolve(res);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Não consegui listar as músicas" : e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void importTrack(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id obrigatório");
            return;
        }
        new Thread(() -> {
            try {
                ContentResolver resolver = getContext().getContentResolver();
                Uri uri = ContentUris.withAppendedId(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
                JSObject out = readFile(resolver, uri);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Não consegui ler a música" : e.getMessage());
            }
        }).start();
    }

    private JSObject readFile(ContentResolver resolver, Uri uri) throws Exception {
        String mime = resolver.getType(uri);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (InputStream in = resolver.openInputStream(uri)) {
            byte[] chunk = new byte[16384];
            int n;
            while ((n = in.read(chunk)) > 0) {
                buffer.write(chunk, 0, n);
            }
        }
        String b64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
        JSObject out = new JSObject();
        out.put("base64", b64);
        out.put("mime", mime == null ? "audio/mpeg" : mime);
        return out;
    }
}