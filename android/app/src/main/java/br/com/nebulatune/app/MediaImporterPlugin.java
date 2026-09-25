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

    private void listTracks(PluginCall call) {
        new Thread(() -> {
            try {
                JSArray out = new JSArray();
                Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                String[] projection = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION
                };
                try (Cursor cur = getContext().getContentResolver().query(
                        collection, projection, null, null, MediaStore.Audio.Media.TITLE + " ASC")) {
                    if (cur != null) {
                        int idCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                        int titleCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                        int artistCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                        int albumCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                        int durCol = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                        while (cur.moveToNext()) {
                            JSObject o = new JSObject();
                            o.put("id", String.valueOf(cur.getLong(idCol)));
                            o.put("title", cur.getString(titleCol));
                            o.put("artist", cur.getString(artistCol));
                            o.put("album", cur.getString(albumCol));
                            o.put("duration", Math.round(cur.getLong(durCol) / 1000.0));
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