/**
 * @format
 *
 * Symbiote canary entry. App code uses our own AppRegistry (the RN-identical
 * `registerComponent(appKey, () => App)`) which mounts via @symbiote/engine, not
 * React Native's renderer. setHostRegistrar hands it RN's AppRegistry so the
 * native Fabric host can find our runnable by app key and call it with the
 * surface's rootTag; our renderer drives nativeFabricUIManager directly from there.
 */

import {
  AppRegistry as RNAppRegistry,
  processColor,
  Image as RNImage,
  DeviceEventEmitter,
} from 'react-native';
import * as ReactNativeViewConfigRegistry from 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry';
import { AppRegistry, setHostRegistrar, setImageSourceResolver } from '@symbiote/react';
import {
  setColorProcessor,
  setDeviceEventSource,
  setNativeViewConfigSource,
} from '@symbiote/engine';
import App from './App';
import { name as appName } from './app.json';

// Diagnostic logs are off unless DEBUG=1 is set when Metro starts (babel inlines
// it). Mirror it onto the global so shared sees it on any host.
globalThis.__SYMBIOTE_DEBUG__ = process.env.DEBUG === '1';

// Colors reach Fabric as platform ints; let shared use RN's own converter.
setColorProcessor(processColor);

// require('./x.png') asset ids and {uri} sources are resolved by RN's own
// resolver before they reach Fabric, so @symbiote/react stays react-native-free.
setImageSourceResolver(source => RNImage.resolveAssetSource(source));

// Native device events (keyboard, app-state, …) are delivered by RN's own
// RCTDeviceEventEmitter, the JS module native actually invokes. We subscribe
// through it rather than registering our own (native ignores a duplicate name).
setDeviceEventSource(DeviceEventEmitter);

// Third-party Fabric views derive their events + prop processors from RN's own
// ViewConfig registry (populated by each library's codegen). `get` throws for an
// unregistered name; our built-ins never reach here, so undefined is the right
// answer for anything the registry doesn't know.
setNativeViewConfigSource(name => {
  try {
    return ReactNativeViewConfigRegistry.get(name);
  } catch {
    return undefined;
  }
});

// Give our AppRegistry RN's own registrar so the native Fabric host finds our
// runnable by app key (native drives RN's AppRegistry, not ours).
setHostRegistrar(RNAppRegistry);

// RN-identical app entry: registerComponent stores a runnable that mounts via
// @symbiote/engine (not React Native's renderer) and bridges it to the host above.
AppRegistry.registerComponent(appName, () => App);
