/**
 * @format
 *
 * Symbiote Vue canary entry (M3 / R4 on-device proof). We register a RUNNABLE with RN's
 * own AppRegistry, not a component, so the native Fabric host invokes it by app key
 * with the surface's rootTag, and we mount the Vue app via @symbiotejs/engine. RN's own
 * renderer is never in the path. (The React canary reaches the same registerRunnable seam
 * through @symbiotejs/react's AppRegistry; the Vue slice has no AppRegistry yet, so we call
 * it directly. It moves into @symbiotejs/components with the rest of the runtime layer.)
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
import { mount } from '@symbiotejs/vue';
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

// Native invokes this runnable by app key with the surface's rootTag; it mounts the Vue
// app through @symbiotejs/engine. registerRunnable (not registerComponent) means RN stores
// a raw mount callback and never renders it with its own renderer.
RNAppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, App);
});
