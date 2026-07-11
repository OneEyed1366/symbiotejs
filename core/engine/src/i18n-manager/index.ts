// I18nManager module: exposes RTL (right-to-left) layout state and lets the app
// allow / force / swap-left-and-right RTL. Mirrors RN's
// Libraries/ReactNative/I18nManager.js, iOS path only. RN reads the native
// constants eagerly at module load (a synchronous getConstants) and exposes them
// both via getConstants() and as the plain `isRTL` / `doLeftAndRightSwapInRTL`
// fields; we keep that shape. The setters are imperative JS->native calls with no
// Fabric view of their own, like Vibration / Keyboard.
//
// The native contract is confirmed from RN's TurboModule spec at
// specs_DEPRECATED/modules/INativeI18nManager.js (`'I18nManager'`):
//   getConstants(): { doLeftAndRightSwapInRTL, isRTL, localeIdentifier? }
//   allowRTL(allowRTL: boolean)
//   forceRTL(forceRTL: boolean)
//   swapLeftAndRightInRTL(flipStyles: boolean)

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';
import { isBoolean } from '../type-guards';

// The iOS native module name RN registers this under (the same name on both
// platforms). A module name is only provable on a real host (a headless fake
// answers to any name), so this name is still pending verification on device.
const I18N_MANAGER_MODULE = 'I18nManager';

export type II18nManagerConstants = {
  isRTL: boolean;
  doLeftAndRightSwapInRTL: boolean;
  localeIdentifier?: string;
};

// The I18nManager native module typed as the interface we vouch for: the single
// point that accepts the native shape (no per-call `as`).
interface INativeI18nManager {
  getConstants(): II18nManagerConstants;
  allowRTL(allowRTL: boolean): void;
  forceRTL(forceRTL: boolean): void;
  swapLeftAndRightInRTL(flipStyles: boolean): void;
}

// RN's fallback constants when no native module is linked (headless / not yet on
// device): not RTL, and the iOS default of swapping in RTL.
const DEFAULT_CONSTANTS: II18nManagerConstants = {
  isRTL: false,
  doLeftAndRightSwapInRTL: true,
};

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

// Narrow the untyped native getConstants() return into our type: a runtime guard
// at the trust boundary rather than an `as`. Falls back to the defaults if any
// field is missing or the wrong type.
function readConstants(module: INativeI18nManager): II18nManagerConstants {
  const raw: unknown = module.getConstants();
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONSTANTS;
  const isRTL = Reflect.get(raw, 'isRTL');
  const doLeftAndRightSwapInRTL = Reflect.get(raw, 'doLeftAndRightSwapInRTL');
  const localeIdentifier = Reflect.get(raw, 'localeIdentifier');
  if (!isBoolean(isRTL) || !isBoolean(doLeftAndRightSwapInRTL)) return DEFAULT_CONSTANTS;
  const constants: II18nManagerConstants = { isRTL, doLeftAndRightSwapInRTL };
  if (isOptionalString(localeIdentifier) && localeIdentifier !== undefined) {
    constants.localeIdentifier = localeIdentifier;
  }
  return constants;
}

// Resolved once, at module load: RN reads the constants eagerly via a single
// synchronous getConstants. `null` when the module isn't linked.
const i18nModule = getNativeModule<INativeI18nManager>(I18N_MANAGER_MODULE);
dlog(`I18nManager: module ${i18nModule ? 'resolved' : 'NOT resolved (null)'}`);

const constants: II18nManagerConstants =
  i18nModule === null ? DEFAULT_CONSTANTS : readConstants(i18nModule);

export const I18nManager = {
  isRTL: constants.isRTL,
  doLeftAndRightSwapInRTL: constants.doLeftAndRightSwapInRTL,

  getConstants(): II18nManagerConstants {
    return constants;
  },

  // Allow the app to render RTL when the device locale is RTL. No-op (logged)
  // without a module: a missing native module must never throw on a device.
  allowRTL(allow: boolean): void {
    if (i18nModule === null) {
      dlog('I18nManager.allowRTL -> I18nManager native module unavailable, no-op');
      return;
    }
    dlog(`I18nManager.allowRTL -> ${allow}`);
    i18nModule.allowRTL(allow);
  },

  // Force RTL regardless of the device locale (takes effect after an app reload).
  forceRTL(force: boolean): void {
    if (i18nModule === null) {
      dlog('I18nManager.forceRTL -> I18nManager native module unavailable, no-op');
      return;
    }
    dlog(`I18nManager.forceRTL -> ${force}`);
    i18nModule.forceRTL(force);
  },

  // Control whether left/right style properties flip in RTL.
  swapLeftAndRightInRTL(swap: boolean): void {
    if (i18nModule === null) {
      dlog('I18nManager.swapLeftAndRightInRTL -> I18nManager native module unavailable, no-op');
      return;
    }
    dlog(`I18nManager.swapLeftAndRightInRTL -> ${swap}`);
    i18nModule.swapLeftAndRightInRTL(swap);
  },
};
