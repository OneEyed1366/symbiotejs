package com.symbiote.android

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// The one ReactPackage for @symbiote/android — the umbrella for every Android host shim
// symbiote ships. A legacy ReactPackage works under the New Architecture via the
// TurboModule interop (on by default in bridgeless), so no codegen spec is needed for a
// plain event-emitter module. Autolinking discovers this class and registers it.
class SymbioteAndroidPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      listOf(KeyboardObserverModule(reactContext), SettingsManagerModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      emptyList()
}
