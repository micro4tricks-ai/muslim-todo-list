package io.github.micro4tricks.muslimtodo;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands the prayer times worked out by the page (js/native.js) to the home-screen widget.
 * The data is a JSON string: { title, next, days: [[ { name, at, time } x5 ] ...] }.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "");
        Context ctx = getContext();
        ctx.getSharedPreferences(PrayerWidget.PREFS, Context.MODE_PRIVATE).edit().putString(PrayerWidget.KEY, data).apply();
        PrayerWidget.refreshAll(ctx);
        call.resolve();
    }

    /** The verse of the day for its widget: { title, text, ref } as JSON. */
    @PluginMethod
    public void verse(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(PrayerWidget.PREFS, Context.MODE_PRIVATE).edit().putString(VerseWidget.KEY, call.getString("data", "")).apply();
        VerseWidget.refreshAll(ctx);
        call.resolve();
    }

    /** The section a widget or an icon shortcut asked for when it opened the app, once. */
    @PluginMethod
    public void takeAction(PluginCall call) {
        JSObject r = new JSObject();
        r.put("view", MainActivity.takePending());
        call.resolve(r);
    }
}
