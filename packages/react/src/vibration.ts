// Vibration module — imperatively drives the `Vibration` native module from a
// pattern. Mirrors RN's Libraries/Vibration/Vibration.js, iOS path only: a number
// is a single buzz, an array dispatches a pattern. RN's iOS branch runs a JS
// setTimeout scheduler to walk the pattern; we drop that timing scheduler and hand
// the whole pattern to native (`vibrateByPattern`), keeping only the number/array
// dispatch the public API promises. No Fabric view — pure JS->native.
//
// The native contract is confirmed from RN's TurboModule spec at
// specs_DEPRECATED/modules/NativeVibration.js (`'Vibration'`):
//   vibrate(pattern: number)
//   vibrateByPattern(pattern: number[], repeat: number)
//   cancel()

import { dlog, getNativeModule } from '@symbiote/shared'

const VIBRATION_MODULE = 'Vibration'

// RN's _default_vibration_length — the single-buzz duration when no pattern is given.
const DEFAULT_VIBRATION_LENGTH = 400

// RN encodes "do not repeat" as -1 and "repeat from start" as 0 in vibrateByPattern.
const REPEAT_NONE = -1
const REPEAT_FROM_START = 0

// The Vibration native module typed as the interface we vouch for — the single point
// that accepts the native shape (no per-call `as`).
interface NativeVibration {
  vibrate(pattern: number): void
  vibrateByPattern(pattern: number[], repeat: number): void
  cancel(): void
}

// Lazily resolved so importing this module has no native side effect.
let vibrationModule: NativeVibration | null | undefined

function getModule(): NativeVibration | null {
  if (vibrationModule === undefined) {
    vibrationModule = getNativeModule<NativeVibration>(VIBRATION_MODULE)
    dlog(`Vibration: Vibration module ${vibrationModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return vibrationModule
}

export const Vibration = {
  // Trigger a vibration. A number is a single buzz of that many ms; an array is a
  // pattern. Degrades to a no-op (logged) when the module is absent — a missing
  // optional native module must never throw on a device.
  vibrate(pattern: number | number[] = DEFAULT_VIBRATION_LENGTH, repeat = false): void {
    const module = getModule()
    if (module === null) {
      dlog('Vibration.vibrate -> Vibration native module unavailable, no-op')
      return
    }
    if (typeof pattern === 'number') {
      dlog(`Vibration.vibrate -> ${pattern}ms`)
      module.vibrate(pattern)
    } else {
      dlog(`Vibration.vibrate -> pattern[${pattern.length}], repeat=${repeat}`)
      module.vibrateByPattern(pattern, repeat ? REPEAT_FROM_START : REPEAT_NONE)
    }
  },

  // Stop an ongoing vibration.
  cancel(): void {
    const module = getModule()
    if (module === null) {
      dlog('Vibration.cancel -> Vibration native module unavailable, no-op')
      return
    }
    dlog('Vibration.cancel')
    module.cancel()
  },
}
