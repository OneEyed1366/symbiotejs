// JS -> native: reaching a native (Turbo)Module. The New Architecture installs
// `global.__turboModuleProxy(name)`: a JSI function that returns the native
// module registered under `name` (a HostObject whose methods call into native),
// or null. React Native's own `TurboModuleRegistry.get` is just this call; we are
// one more client of the same global, exactly as `getSlot` is for the view tree.
//
// This is first-party access, for symbiote's own modules (StatusBarManager,
// KeyboardObserver, ...). Third-party RN packages import `TurboModuleRegistry` from
// `'react-native'` and read the same global themselves; they do not go through
// here.

import { dlog } from '../debug';
import {
  installDeviceEventHub,
  NativeEventEmitter,
  type IEventEmitterModule,
} from '../native-events';
import { isRecord } from '../type-guards';

// The JSI global, typed at the trust boundary. It is genuinely polymorphic in the
// module name, so (like RN's own `TurboModuleRegistry.get<T>(name): ?T`) the
// caller vouches for the module's shape via `T`. Declaring the generic here is the
// single point where we accept the native contract, with no per-call cast (cf.
// `nativeFabricUIManager` in fabric.ts). Absent on the legacy (Paper) architecture.
declare global {
  // Non-bridgeless New Architecture: a function proxy you call by module name.

  var __turboModuleProxy: (<T>(name: string) => T | null) | undefined;
  // Bridgeless (RCTHost): TurboModuleBinding installs the modules as a HostObject
  // keyed by module name INSTEAD of __turboModuleProxy (the function is installed
  // only when !RN$Bridgeless). This is what RN's own NativeModules resolves to in
  // bridgeless. We read it as the fallback, exactly as TurboModuleRegistry does.

  var nativeModuleProxy: Record<string, unknown> | undefined;
}

// The native module value crosses from an untyped HostObject into our types here;
// the caller vouches for its shape via T (the single trust-boundary narrowing, no
// per-call `as`). Native modules are always non-null objects.
function isNativeModule<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

// The native module `name`, typed as the caller's interface `T`, or null when no
// module by that name is registered in the binary (or the proxy is absent, e.g.
// running headless without a fake installed).
export function getNativeModule<T>(name: string): T | null {
  // Non-bridgeless: the function proxy. Call it by name.
  const turboProxy = globalThis.__turboModuleProxy;
  if (typeof turboProxy === 'function') {
    const module = turboProxy<T>(name);
    if (module !== null && module !== undefined) return module;
  }
  // Bridgeless: the HostObject proxy, indexed by name. Guard the access: a
  // HostObject may throw for an unlinked name, and a throw here would propagate
  // into a render effect and blank the tree.
  const bridgelessProxy = globalThis.nativeModuleProxy;
  if (bridgelessProxy !== undefined) {
    try {
      const module = bridgelessProxy[name];
      if (isNativeModule<T>(module)) return module;
    } catch (error) {
      dlog(`nativeModuleProxy["${name}"] threw: ${String(error)}`);
    }
  }
  dlog(
    `native module "${name}" not found ` +
      `(turbo=${typeof turboProxy}, bridgeless=${typeof globalThis.nativeModuleProxy})`,
  );
  return null;
}

// Same, but throws when the module is missing, for modules a feature hard-depends
// on (StatusBar without StatusBarManager cannot function, so failing loud beats a
// silent no-op).
export function getEnforcingNativeModule<T>(name: string): T {
  const module = getNativeModule<T>(name);
  if (module === null) {
    throw new Error(
      `Native module "${name}" is not registered in the binary. ` +
        'Verify it is linked (New Architecture / bridgeless host with __turboModuleProxy installed).',
    );
  }
  return module;
}

// ---- device-event module factory ------------------------------------------
//
// AccessibilityInfo (iOS + Android), AppState, Appearance, BackHandler, Keyboard,
// and Dimensions each hand-rolled the identical plumbing: lazily resolve a native
// module, lazily build a NativeEventEmitter bound to it, install the device-event
// hub on first subscribe. `createLinking` (linking/shared.ts) proved this factors
// out safely for Linking's iOS/Android split; this is the general form for every
// other lazy-module + emitter pair in the runtime-module layer.
//
// Each caller's DEGRADE POLICY stays its own, via config - the factory owns only
// the plumbing:
//   - `bindModuleToEmitter` (default true): whether the resolved module is wired
//     into the emitter so its addListener/removeListeners observe-counters get
//     pinged. Dimensions' DeviceInfo module has no observe-counters, so it opts out
//     (matching its original `new NativeEventEmitter(undefined)`).
//   - `onEmitterCreated`: runs exactly once, right after the emitter is built -
//     the hook for a caller's own permanent self-subscription (AppState/Appearance/
//     BackHandler/Keyboard each keep a cache fresh or dispatch a chain this way) or
//     one-time hydration from the module's constants (AppState's initial state,
//     Dimensions' initial metrics - the latter also relies on this hook running
//     `addListener` BEFORE the constants read, preserving the original
//     subscribe-before-resolve ordering that guards against missing an update).

// A structural check, not a cast: narrows an arbitrary resolved module down to
// IEventEmitterModule only when it actually carries both observe-counter methods.
// Needed because `TModule` is unconstrained (Dimensions' INativeDeviceInfo doesn't
// extend IEventEmitterModule at all) - NativeEventEmitter itself re-checks the same
// shape internally, so this exists to satisfy the type system, not to change
// behavior.
function hasEventEmitterShape(value: unknown): value is IEventEmitterModule {
  return (
    isRecord(value) &&
    typeof value.addListener === 'function' &&
    typeof value.removeListeners === 'function'
  );
}

export interface IDeviceEventModuleConfig<TModule> {
  // The native module name, resolved via getNativeModule.
  moduleName: string;
  // Exact dlog prefix for the module-resolution log (e.g. 'AppState: module' or
  // 'Keyboard: KeyboardObserver module') - caller-specified so each module's
  // existing dlog text doesn't drift.
  moduleLogPrefix: string;
  bindModuleToEmitter?: boolean;
  onEmitterCreated?: (emitter: NativeEventEmitter, module: TModule | null) => void;
}

export interface IDeviceEventModule<TModule> {
  getModule(): TModule | null;
  getEmitter(): NativeEventEmitter;
}

// Build one module's lazy-resolve + lazy-emitter pair. Each call owns its own
// cache, so two callers (or two platform builds loaded together in one smoke) stay
// independent - the same guarantee `createLinking` documents.
export function createDeviceEventModule<TModule>(
  config: IDeviceEventModuleConfig<TModule>,
): IDeviceEventModule<TModule> {
  let module: TModule | null | undefined;
  let emitter: NativeEventEmitter | undefined;

  function getModule(): TModule | null {
    if (module === undefined) {
      module = getNativeModule<TModule>(config.moduleName);
      dlog(`${config.moduleLogPrefix} ${module ? 'resolved' : 'NOT resolved (null)'}`);
    }
    return module;
  }

  function getEmitter(): NativeEventEmitter {
    if (emitter === undefined) {
      // WHY lazy: install on first subscribe so the hub exists before native
      // emits, without a hard bootstrap-order dependency. Idempotent.
      installDeviceEventHub();
      const resolved = getModule();
      const bindModule = config.bindModuleToEmitter ?? true;
      const boundModule =
        bindModule && resolved !== null && hasEventEmitterShape(resolved) ? resolved : undefined;
      emitter = new NativeEventEmitter(boundModule);
      config.onEmitterCreated?.(emitter, resolved);
    }
    return emitter;
  }

  return { getModule, getEmitter };
}
