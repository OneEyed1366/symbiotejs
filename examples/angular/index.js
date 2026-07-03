/**
 * @format
 *
 * Symbiote Angular canary entry. Our own AppRegistry (the RN-identical
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
  AppRegistry,
  setHostRegistrar,
  setColorProcessor,
  setDeviceEventSource,
  setNativeViewConfigSource,
} from '@symbiotejs/angular';
import { AppComponent } from './build/angular/App';
import { name as appName } from './app.json';

globalThis.__SYMBIOTE_DEBUG__ = process.env.DEBUG === '1';

setColorProcessor(processColor);
setDeviceEventSource(DeviceEventEmitter);
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
AppRegistry.registerComponent(appName, () => AppComponent);
