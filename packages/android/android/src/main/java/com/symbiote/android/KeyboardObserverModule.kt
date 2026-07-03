package com.symbiote.android

import android.util.Log
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.PixelUtil

// Android's only built-in keyboard-event source is ReactRootView.CustomGlobalLayoutListener,
// which symbiote's Fabric surface bypasses — so keyboardDidShow/Hide never fire (the
// bridgeless ReactSurfaceView emits no keyboard events). This module re-provides exactly
// that signal: an OnApplyWindowInsetsListener on the activity's decor view that reads the
// IME inset and emits the same events RN's JS Keyboard module already listens for.
//
// Why the apply-insets listener and not getRootWindowInsets()+OnGlobalLayout: an on-demand
// getRootWindowInsets() returns the *consumed* insets, so getInsets(ime()).bottom reads 0
// under adjustResize even while the keyboard is up. The apply-insets dispatch carries the
// raw ime() inset (the real height), and without a WindowInsetsAnimation callback it fires
// with the settled target insets — exactly the keyboard frame we want.
//
// Named "KeyboardObserver" on purpose: @symbiotejs/react's Keyboard resolves that module
// name on iOS (RCTKeyboardObserver) and now on Android too, so the JS adapter stays
// platform-uniform and entirely unchanged. The height math mirrors ReactRootView
// (imeInsets.bottom - systemBars.bottom); we re-derive it here rather than fork RN.
class KeyboardObserverModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private var listenerCount = 0
  private var keyboardVisible = false
  private var observedView: View? = null

  override fun getName(): String = NAME

  // NativeEventEmitter's observe-counters: the first listener starts native observation,
  // the last one stops it, so we watch the keyboard only while JS is subscribed.
  @ReactMethod
  fun addListener(eventType: String) {
    Log.i(TAG, "addListener($eventType) count=$listenerCount")
    if (listenerCount == 0) {
      reactApplicationContext.addLifecycleEventListener(this)
      UiThreadUtil.runOnUiThread { attach() }
    }
    listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = maxOf(0, listenerCount - count.toInt())
    if (listenerCount == 0) {
      reactApplicationContext.removeLifecycleEventListener(this)
      UiThreadUtil.runOnUiThread { detach() }
    }
  }

  // The activity (and its decor view) may not exist when JS first subscribes; re-attach
  // on resume so a subscription made before the window is ready still starts observing.
  override fun onHostResume() {
    if (listenerCount > 0) UiThreadUtil.runOnUiThread { attach() }
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() = detach()

  private fun attach() {
    if (observedView != null) return
    val view = reactApplicationContext.currentActivity?.window?.decorView
    Log.i(TAG, "attach() decorView=${if (view != null) "present" else "NULL"}")
    if (view == null) return
    observedView = view
    keyboardVisible = false
    // Return the insets unchanged — we observe, never consume, so RN's own inset
    // handling (status bar, safe area) is untouched.
    ViewCompat.setOnApplyWindowInsetsListener(view) { _, insets ->
      handleInsets(insets)
      insets
    }
    ViewCompat.requestApplyInsets(view)
  }

  private fun detach() {
    observedView?.let { ViewCompat.setOnApplyWindowInsetsListener(it, null) }
    observedView = null
    keyboardVisible = false
  }

  // Emit keyboardDidShow/Hide on an IME-visibility transition. The raw ime() inset carried
  // by the apply dispatch is the keyboard's height; subtracting the nav-bar inset gives the
  // on-screen keyboard height above it (RN's `imeInsets.bottom - barInsets.bottom`).
  //
  // isVisible(ime()) is true for ANY IME surface — including Gboard's floating/compact
  // one-handed bar (height ~64dp), not only a full keyboard. That is intentional parity:
  // RN's ReactRootView keys off the same ime() visibility, so both report that bar as
  // keyboard-up with its real (small) height. A real device with a normal keyboard never
  // hits the compact bar; suppressing it by a height threshold would diverge from RN.
  private fun handleInsets(insets: WindowInsetsCompat) {
    val view = observedView ?: return
    val visible = insets.isVisible(WindowInsetsCompat.Type.ime())
    if (visible == keyboardVisible) return
    keyboardVisible = visible

    val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val barBottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom
    val heightPx = (imeBottom - barBottom).coerceAtLeast(0)
    val widthDip = PixelUtil.toDIPFromPixel(view.width.toFloat()).toDouble()
    if (visible) {
      val heightDip = PixelUtil.toDIPFromPixel(heightPx.toFloat()).toDouble()
      val screenYDip = PixelUtil.toDIPFromPixel((view.height - heightPx).toFloat()).toDouble()
      Log.i(TAG, "keyboardDidShow height=${heightPx}px")
      emit("keyboardDidShow", payload(screenYDip, widthDip, heightDip))
    } else {
      val screenYDip = PixelUtil.toDIPFromPixel(view.height.toFloat()).toDouble()
      Log.i(TAG, "keyboardDidHide")
      emit("keyboardDidHide", payload(screenYDip, widthDip, 0.0))
    }
  }

  private fun emit(event: String, params: WritableMap) {
    reactApplicationContext.emitDeviceEvent(event, params)
  }

  private fun payload(screenY: Double, width: Double, height: Double): WritableMap {
    val endCoordinates =
        Arguments.createMap().apply {
          putDouble("screenX", 0.0)
          putDouble("screenY", screenY)
          putDouble("width", width)
          putDouble("height", height)
        }
    return Arguments.createMap().apply {
      putMap("endCoordinates", endCoordinates)
      putString("easing", "keyboard")
      putDouble("duration", 0.0)
    }
  }

  companion object {
    const val NAME = "KeyboardObserver"
    private const val TAG = "SymbioteKeyboard"
  }
}
