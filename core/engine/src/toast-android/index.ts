// ToastAndroid module: pops a brief Android system toast from JS. Mirrors RN's
// Libraries/Components/ToastAndroid/ToastAndroid.android.js: `show` takes a message
// and a duration; `showWithGravity` adds a layout gravity; `showWithGravityAndOffset`
// adds an x/y pixel offset. No Fabric view, pure JS->native.
//
// symbiote is iOS-first and this is an Android-only module. RN's iOS fallback
// (ToastAndroid.ios.js) throws "not supported"; we prefer a no-op + dlog so a
// cross-platform smoke never crashes when the native module is absent.
//
// The native contract is confirmed from RN's TurboModule spec at
// specs_DEPRECATED/modules/INativeToastAndroid.js:
//   getConstants(): { SHORT, LONG, TOP, BOTTOM, CENTER }
//   show(message: string, duration: number)
//   showWithGravity(message: string, duration: number, gravity: number)
//   showWithGravityAndOffset(message, duration, gravity, xOffset, yOffset)

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

// The native module name RN registers this under. NOTE: this is the name the spec
// resolves via `TurboModuleRegistry.getEnforcing<Spec>('ToastAndroid')`, NOT the
// spec filename `INativeToastAndroid`. Per the symbiote invariant, a module name is
// only provable on a real host (a headless fake answers to any name); this Android
// name is device-verify-pending. See .docs/native-module-platform-routing.md.
const TOAST_MODULE = 'ToastAndroid';

// Conventional RN values for SHORT/LONG/TOP/BOTTOM/CENTER. On a real device the
// numbers come from native getConstants() (resolved below); these are the fallbacks
// that keep the constants object populated headless and on a host without the module.
const FALLBACK_CONSTANTS = {
  SHORT: 0,
  LONG: 1,
  TOP: 48,
  BOTTOM: 80,
  CENTER: 17,
} as const;

// The numeric constants ToastAndroid exposes. Same keys as the native getConstants().
interface IToastConstants {
  SHORT: number;
  LONG: number;
  TOP: number;
  BOTTOM: number;
  CENTER: number;
}

// The ToastAndroid native module typed as the interface we vouch for, the single
// point that accepts the native shape (no per-call `as`).
interface INativeToastAndroid {
  getConstants(): { [key: string]: unknown };
  show(message: string, duration: number): void;
  showWithGravity(message: string, duration: number, gravity: number): void;
  showWithGravityAndOffset(
    message: string,
    duration: number,
    gravity: number,
    xOffset: number,
    yOffset: number,
  ): void;
}

// Lazily resolved so importing this module has no native side effect.
let toastModule: INativeToastAndroid | null | undefined;

function getModule(): INativeToastAndroid | null {
  if (toastModule === undefined) {
    toastModule = getNativeModule<INativeToastAndroid>(TOAST_MODULE);
    dlog(`ToastAndroid: ToastAndroid module ${toastModule ? 'resolved' : 'NOT resolved (null)'}`);
  }
  return toastModule;
}

// Read a single numeric constant from the native getConstants() payload, narrowing
// with a `typeof` guard (no cast) and falling back to the conventional RN value when
// the module or the key is absent.
function readConstant(raw: { [key: string]: unknown }, key: keyof IToastConstants): number {
  const value = raw[key];
  return typeof value === 'number' ? value : FALLBACK_CONSTANTS[key];
}

// Resolve the constants once: real numbers from native on a device, fallbacks
// otherwise. Always returns a fully-populated object so the constants are never
// undefined, even headless.
function resolveConstants(): IToastConstants {
  const module = getModule();
  if (module === null) {
    dlog('ToastAndroid: constants from fallbacks (native module unavailable)');
    return { ...FALLBACK_CONSTANTS };
  }
  const raw = module.getConstants();
  return {
    SHORT: readConstant(raw, 'SHORT'),
    LONG: readConstant(raw, 'LONG'),
    TOP: readConstant(raw, 'TOP'),
    BOTTOM: readConstant(raw, 'BOTTOM'),
    CENTER: readConstant(raw, 'CENTER'),
  };
}

const constants = resolveConstants();

export const ToastAndroid = {
  // Toast duration constants.
  SHORT: constants.SHORT,
  LONG: constants.LONG,
  // Toast gravity constants.
  TOP: constants.TOP,
  BOTTOM: constants.BOTTOM,
  CENTER: constants.CENTER,

  // Show a toast with the given message and duration. Degrades to a no-op (logged)
  // when the module is absent; a missing optional native module must never throw.
  show(message: string, duration: number): void {
    const module = getModule();
    if (module === null) {
      dlog('ToastAndroid.show -> ToastAndroid native module unavailable, no-op');
      return;
    }
    dlog(`ToastAndroid.show -> "${message}" (${duration})`);
    module.show(message, duration);
  },

  // Show a toast at the given layout gravity (TOP / BOTTOM / CENTER).
  showWithGravity(message: string, duration: number, gravity: number): void {
    const module = getModule();
    if (module === null) {
      dlog('ToastAndroid.showWithGravity -> ToastAndroid native module unavailable, no-op');
      return;
    }
    dlog(`ToastAndroid.showWithGravity -> "${message}" (${duration}, gravity=${gravity})`);
    module.showWithGravity(message, duration, gravity);
  },

  // Show a toast at the given gravity, offset by xOffset/yOffset pixels.
  showWithGravityAndOffset(
    message: string,
    duration: number,
    gravity: number,
    xOffset: number,
    yOffset: number,
  ): void {
    const module = getModule();
    if (module === null) {
      dlog(
        'ToastAndroid.showWithGravityAndOffset -> ToastAndroid native module unavailable, no-op',
      );
      return;
    }
    dlog(
      `ToastAndroid.showWithGravityAndOffset -> "${message}" (${duration}, gravity=${gravity}, ${xOffset}, ${yOffset})`,
    );
    module.showWithGravityAndOffset(message, duration, gravity, xOffset, yOffset);
  },
};
