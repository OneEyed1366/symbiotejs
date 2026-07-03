/**
 * @format
 *
 * Symbiote Vue canary entry (M3 / R4 on-device proof). Our own AppRegistry (the RN-identical
 * `registerComponent(appKey, () => App)`) mounts via @symbiotejs/engine, not React Native's
 * renderer. setHostRegistrar hands it RN's AppRegistry so the native Fabric host can find our
 * runnable by app key and call it with the surface's rootTag; our renderer drives
 * nativeFabricUIManager directly from there — the same entry point the React canary uses.
 */

import {
  AppRegistry as RNAppRegistry,
  processColor,
  DeviceEventEmitter,
} from 'react-native';
import * as ReactNativeViewConfigRegistry from 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry';
import {
  setColorProcessor,
  setDeviceEventSource,
  setNativeViewConfigSource,
} from '@symbiotejs/engine';
import { AppRegistry, setHostRegistrar } from '@symbiotejs/vue';
import App from './App';
import { name as appName } from './app.json';

// Diagnostic logs are off unless DEBUG=1 is set when Metro starts (babel inlines it).
globalThis.__SYMBIOTE_DEBUG__ = process.env.DEBUG === '1';

// Colors reach Fabric as platform ints; let the engine use RN's own converter.
setColorProcessor(processColor);

// Native device events (keyboard, app-state, …) arrive via RN's own
// RCTDeviceEventEmitter, the JS module native actually invokes.
setDeviceEventSource(DeviceEventEmitter);

// Third-party Fabric views derive their events + prop processors from RN's own ViewConfig
// registry; `get` throws for an unregistered name, so undefined is the right answer for
// anything the registry doesn't know (our built-ins never reach here).
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
// @symbiotejs/engine (not React Native's renderer) and bridges it to the host above.
AppRegistry.registerComponent(appName, () => App);
