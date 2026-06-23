package com.symbiote.android

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap

// RN's `Settings` is a wrapper for iOS NSUserDefaults — "a persistent key-value store
// available only on iOS" (reactnative.dev/docs/settings). Stock RN has no Android half:
// Settings.js routes non-iOS to SettingsFallback, which just warns and returns null. So
// @symbiote/react's Settings (which resolves the iOS module name "SettingsManager")
// finds nothing on Android and silently loses every write on reload.
//
// This shim re-supplies that signal: it owns the "SettingsManager" name on Android too
// (RN registers nothing under it here, so there's no collision) and backs it with
// SharedPreferences — Android's closest equivalent to NSUserDefaults. The JS adapter is
// unchanged and stays platform-uniform; it just now finds a real module on Android.
//
// It mirrors the iOS native surface settings.ts consumes: getConstants().settings seeds
// the snapshot, setValues/deleteValues persist, and an external write re-broadcasts
// through the `settingsUpdated` device event. Like RCTSettingsManager's `_ignoringUpdates`
// flag, we suppress that event for our OWN writes so only changes made outside RN fire it.
class SettingsManagerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val preferences: SharedPreferences =
      reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  // Suppress the settingsUpdated re-broadcast while we apply our own setValues/deleteValues,
  // matching iOS RCTSettingsManager._ignoringUpdates — the JS set() path already fired its
  // watchers, so echoing the change back would be redundant.
  private var ignoringUpdates = false
  private var listenerCount = 0

  // SharedPreferences holds its change listener by a WeakReference, so we keep a strong
  // field to it; otherwise GC could silently drop our subscription.
  private val changeListener =
      SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
        if (!ignoringUpdates) emit("settingsUpdated", readAll())
      }

  override fun getName(): String = NAME

  // The seeded snapshot RN reads once on mount (settings.ts getSnapshot). iOS returns the
  // whole NSUserDefaults dictionary; we return every persisted SharedPreferences entry.
  override fun getConstants(): MutableMap<String, Any> =
      mutableMapOf("settings" to readAll())

  @ReactMethod
  fun setValues(values: ReadableMap) {
    ignoringUpdates = true
    val editor = preferences.edit()
    val iterator = values.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      writeValue(editor, key, values)
    }
    editor.apply()
    ignoringUpdates = false
  }

  @ReactMethod
  fun deleteValues(keys: ReadableArray) {
    ignoringUpdates = true
    val editor = preferences.edit()
    for (index in 0 until keys.size()) {
      keys.getString(index)?.let { editor.remove(it) }
    }
    editor.apply()
    ignoringUpdates = false
  }

  // settings.ts subscribes via NativeEventEmitter, which calls these on the native module.
  // We register the SharedPreferences listener only while JS is observing (first→last).
  @ReactMethod
  fun addListener(eventType: String) {
    if (listenerCount == 0) preferences.registerOnSharedPreferenceChangeListener(changeListener)
    listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = maxOf(0, listenerCount - count.toInt())
    if (listenerCount == 0) preferences.unregisterOnSharedPreferenceChangeListener(changeListener)
  }

  // Mirror iOS's plist write: a null value removes the key (RCTConvert NSPropertyList nil →
  // removeObjectForKey). SharedPreferences has no putDouble, so a JS number is stored as Int
  // when integral and in range, else Float — exact for counters/flags; fractional doubles
  // round to ~7 significant digits. Nested Map/Array aren't supported (NSUserDefaults takes
  // them; SharedPreferences doesn't) and are skipped with a warning rather than silently lost.
  private fun writeValue(editor: SharedPreferences.Editor, key: String, values: ReadableMap) {
    when (values.getType(key)) {
      ReadableType.Null -> editor.remove(key)
      ReadableType.Boolean -> editor.putBoolean(key, values.getBoolean(key))
      ReadableType.String -> editor.putString(key, values.getString(key))
      ReadableType.Number -> {
        val number = values.getDouble(key)
        if (number == Math.floor(number) && !number.isInfinite() &&
            number >= Int.MIN_VALUE.toDouble() && number <= Int.MAX_VALUE.toDouble()) {
          editor.putInt(key, number.toInt())
        } else {
          editor.putFloat(key, number.toFloat())
        }
      }
      ReadableType.Map, ReadableType.Array ->
          Log.w(TAG, "setValues: nested value for \"$key\" is unsupported on Android, skipped")
    }
  }

  // Rebuild the JS-visible snapshot from typed SharedPreferences entries. Int/Long/Float all
  // surface as JS numbers (putDouble); booleans/strings keep their type — so a value written
  // through setValues reads back as the same JS type.
  private fun readAll(): WritableMap {
    val map = Arguments.createMap()
    for ((key, value) in preferences.all) {
      when (value) {
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Long -> map.putDouble(key, value.toDouble())
        is Float -> map.putDouble(key, value.toDouble())
        is String -> map.putString(key, value)
        else -> Unit
      }
    }
    return map
  }

  private fun emit(event: String, params: WritableMap) {
    reactApplicationContext.emitDeviceEvent(event, params)
  }

  companion object {
    const val NAME = "SettingsManager"
    // App-private store; a stable name so values survive relaunch (the whole point).
    private const val PREFS_NAME = "symbiote.settings"
    private const val TAG = "SymbioteSettings"
  }
}
