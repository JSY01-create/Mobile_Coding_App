package io.github.jsy01create.thumbcode;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Lets Thumbcode keep projects in shared storage (Documents/Thumbcode), so other apps
 * such as Files and Gallery can add images and the editor can read everything there.
 * Android 11 and newer: "All files access" (MANAGE_EXTERNAL_STORAGE) from the settings screen.
 * Android 10 and older: the storage permission.
 */
@CapacitorPlugin(
    name = "StorageAccess",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class StorageAccessPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    private void answer(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", granted());
        call.resolve(result);
    }

    @PluginMethod
    public void check(PluginCall call) {
        answer(call);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (granted()) {
            answer(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            try {
                startActivityForResult(call, intent, "settingsClosed");
            } catch (Exception e) {
                // Some phones only have the general list of apps.
                startActivityForResult(call, new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), "settingsClosed");
            }
        } else {
            requestPermissionForAlias("storage", call, "permissionAnswered");
        }
    }

    @ActivityCallback
    private void settingsClosed(PluginCall call, ActivityResult result) {
        answer(call);
    }

    @PermissionCallback
    private void permissionAnswered(PluginCall call) {
        answer(call);
    }
}
