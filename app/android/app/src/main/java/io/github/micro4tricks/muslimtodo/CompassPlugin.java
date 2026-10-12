package io.github.micro4tricks.muslimtodo;

import android.content.Context;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's own compass for the qibla (js/qibla.js): start({ lat, lon }) listens to the rotation
 * vector sensor, which fuses the magnetometer with the gyroscope and so is steadier than the page's
 * orientation events, and sends "heading" events ({ heading, magnetic, declination, accuracy })
 * about 30 times a second: heading is from true north (Android's GeomagneticField declination at
 * the user's place), accuracy is the sensor's own report (0 unreliable … 3 high). stop() ends it.
 * Nothing runs unless the page asked and is listening.
 */
@CapacitorPlugin(name = "Compass")
public class CompassPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensors;
    private Sensor sensor;
    private boolean running = false;
    private float declination = 0f;
    private int accuracy = -1;
    private long lastSent = 0;
    private final float[] rot = new float[9], remapped = new float[9], angles = new float[3];

    @Override
    public void load() {
        sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        // The emulator's made-up sensors brought the whole emulator down once this sensor started
        // (the CI check, 2026-10-12); there the page uses its own orientation events instead.
        if (isEmulator()) return;
        if (sensors != null) {
            sensor = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            if (sensor == null) sensor = sensors.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR);
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", sensor != null);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (isEmulator()) { call.reject("emulator"); return; } // the page then starts no sensor at all
        if (sensor == null) { call.reject("no compass"); return; }
        Double lat = call.getDouble("lat"), lon = call.getDouble("lon");
        if (lat != null && lon != null) {
            GeomagneticField f = new GeomagneticField(lat.floatValue(), lon.floatValue(), 0f, System.currentTimeMillis());
            declination = f.getDeclination();
        }
        if (!running) {
            running = sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
        }
        JSObject r = new JSObject();
        r.put("declination", declination);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        halt();
        call.resolve();
    }

    private void halt() {
        if (running && sensors != null) sensors.unregisterListener(this);
        running = false;
    }

    @Override
    protected void handleOnPause() { halt(); } // the page starts it again when it comes back

    @Override
    protected void handleOnDestroy() { halt(); }

    @Override
    public void onSensorChanged(SensorEvent e) {
        long now = System.currentTimeMillis();
        if (now - lastSent < 33) return;
        lastSent = now;
        SensorManager.getRotationMatrixFromVector(rot, e.values);
        // The screen may be turned: measure where the top of the screen points.
        int x = SensorManager.AXIS_X, y = SensorManager.AXIS_Y;
        switch (rotation()) {
            case Surface.ROTATION_90: x = SensorManager.AXIS_Y; y = SensorManager.AXIS_MINUS_X; break;
            case Surface.ROTATION_180: x = SensorManager.AXIS_MINUS_X; y = SensorManager.AXIS_MINUS_Y; break;
            case Surface.ROTATION_270: x = SensorManager.AXIS_MINUS_Y; y = SensorManager.AXIS_X; break;
            default: break;
        }
        SensorManager.remapCoordinateSystem(rot, x, y, remapped);
        SensorManager.getOrientation(remapped, angles);
        float magnetic = (float) ((Math.toDegrees(angles[0]) + 360.0) % 360.0);
        JSObject d = new JSObject();
        d.put("magnetic", magnetic);
        d.put("declination", declination);
        d.put("heading", (magnetic + declination + 360f) % 360f);
        d.put("accuracy", accuracy);
        notifyListeners("heading", d);
    }

    @Override
    public void onAccuracyChanged(Sensor s, int a) { accuracy = a; }

    private static boolean isEmulator() {
        String hw = Build.HARDWARE == null ? "" : Build.HARDWARE;
        String fp = Build.FINGERPRINT == null ? "" : Build.FINGERPRINT;
        return hw.equals("ranchu") || hw.equals("goldfish") || fp.startsWith("generic") || fp.contains("emulator") || fp.contains("sdk_gphone");
    }

    private int rotation() {
        try {
            if (Build.VERSION.SDK_INT >= 30 && getActivity() != null) {
                Display d = getActivity().getDisplay();
                if (d != null) return d.getRotation();
            }
            WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
            return wm.getDefaultDisplay().getRotation();
        } catch (Exception ignored) {
            return Surface.ROTATION_0;
        }
    }
}
