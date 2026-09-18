package br.com.nebulatune.app;

import android.content.Intent;
import android.net.Uri;
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
