// JS -> native: reaching a native (Turbo)Module. The New Architecture installs
// `global.__turboModuleProxy(name)`: a JSI function that returns the native
// module registered under `name` (a HostObject whose methods call into native),
// or null. React Native's own `TurboModuleRegistry.get` is just this call; we are
// one more client of the same global, exactly as `getSlot` is for the view tree.
//
// This is first-party access, for symbiote's own modules (StatusBarManager,
// KeyboardObserver, …). Third-party RN packages import `TurboModuleRegistry` from
// `'react-native'` and read the same global themselves; they do not go through
// here. See .docs/decisions/0012.

import { dlog } from './debug';

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
