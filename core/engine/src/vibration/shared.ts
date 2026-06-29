// Shared core of the Vibration module, everything that does NOT differ by platform:
// the public contract, the lazy native-module resolver, the single-number `vibrate`
// path, and `cancel`. The per-platform files (vibration.ios.ts / vibration.android.ts)
// supply ONLY what genuinely diverges (how an array PATTERN is walked) and hand it to
// `createVibration`. Mirrors RN's Libraries/Vibration/Vibration.js: a number is a single
// buzz, an array is a pattern.
//
// Native module name is `Vibration` on BOTH iOS and Android (see
// .docs/native-module-platform-routing.md), so unlike Linking the module name is shared,
// not divergent. The TurboModule spec lives at specs_DEPRECATED/modules/INativeVibration.js:
//   vibrate(pattern: number)
//   vibrateByPattern(pattern: number[], repeat: number)
//   cancel()
//
// Metro selects the platform file on a real host (vibration.android.ts > vibration.ts);
// the base vibration.ts re-exports the iOS build for web/headless. There is no runtime
// `Platform.OS` read; the filename is the selector. See ADR 0019. No Fabric view,
// pure JS->native.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

const VIBRATION_MODULE = 'Vibration';

// RN's _default_vibration_length: the single-buzz duration when no pattern is given,
// and the per-segment buzz length the iOS scheduler emits between waits.
export const DEFAULT_VIBRATION_LENGTH = 400;

// The Vibration native module typed as the interface we vouch for, the single point
// that accepts the native shape (no per-call `as`).
export interface INativeVibration {
  vibrate(pattern: number): void;
  vibrateByPattern(pattern: number[], repeat: number): void;
  cancel(): void;
}

// What every platform's Vibration exposes to app code.
export interface IVibrationStatic {
  vibrate(pattern?: number | number[], repeat?: boolean): void;
  cancel(): void;
}

// The platform-divergent bits. Android hands the whole pattern to native
// `vibrateByPattern`; iOS has no native pattern scheduler, so it walks the segments
// JS-side with setTimeout. `stopPattern` is the iOS scheduler's chance to clear its own
// JS state on cancel (Android's pattern is native, so it has nothing to stop). The
// single-number path and the native cancel call itself are shared, not part of this.
export interface IVibrationPlatform {
  vibratePattern(module: INativeVibration, pattern: number[], repeat: boolean): void;
  stopPattern?(): void;
}

// Build a platform's Vibration from its array-pattern strategy. Each call owns its own
// lazy module cache, so importing both platform builds in a smoke keeps them independent.
// On a real host only one platform file is ever bundled.
export function createVibration(platform: IVibrationPlatform): IVibrationStatic {
  let vibrationModule: INativeVibration | null | undefined;

  function getModule(): INativeVibration | null {
    if (vibrationModule === undefined) {
      vibrationModule = getNativeModule<INativeVibration>(VIBRATION_MODULE);
      dlog(`Vibration: Vibration module ${vibrationModule ? 'resolved' : 'NOT resolved (null)'}`);
    }
    return vibrationModule;
  }

  return {
    // Trigger a vibration. A number is a single buzz of that many ms; an array is a
    // pattern delegated to the platform strategy. Degrades to a no-op (logged) when the
    // module is absent; a missing optional native module must never throw on a device.
    vibrate(pattern: number | number[] = DEFAULT_VIBRATION_LENGTH, repeat = false): void {
      const module = getModule();
      if (module === null) {
        dlog('Vibration.vibrate -> Vibration native module unavailable, no-op');
        return;
      }
      if (typeof pattern === 'number') {
        dlog(`Vibration.vibrate -> ${pattern}ms`);
        module.vibrate(pattern);
        return;
      }
      dlog(`Vibration.vibrate -> pattern[${pattern.length}], repeat=${repeat}`);
      platform.vibratePattern(module, pattern, repeat);
    },

    // Stop an ongoing vibration. The iOS scheduler bails on its next tick once it clears
    // its own JS state (stopPattern); both platforms then tell native to cancel.
    cancel(): void {
      const module = getModule();
      if (module === null) {
        dlog('Vibration.cancel -> Vibration native module unavailable, no-op');
        return;
      }
      dlog('Vibration.cancel');
      platform.stopPattern?.();
      module.cancel();
    },
  };
}
