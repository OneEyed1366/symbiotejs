// Vibration module — imperatively drives the `Vibration` native module from a
// pattern. Mirrors RN's Libraries/Vibration/Vibration.js: a number is a single
// buzz, an array is a pattern. The two platforms walk a pattern differently, so
// like RN we branch on Platform.OS in this one file (NOT a .ios/.android split —
// the tsx smoke harness has no Metro platform resolution):
//   - Android hands the whole pattern to native `vibrateByPattern(pattern, repeat)`.
//   - iOS has no native pattern scheduler, so RN walks the segments JS-side with
//     setTimeout (vibrate, wait, vibrate, …); we keep that scheduler so iOS
//     pattern vibration actually repeats instead of firing a single buzz.
// No Fabric view — pure JS->native.
//
// Native module name is `Vibration` on BOTH iOS and Android (see
// .docs/native-module-platform-routing.md). The TurboModule spec lives at
// specs_DEPRECATED/modules/NativeVibration.js:
//   vibrate(pattern: number)
//   vibrateByPattern(pattern: number[], repeat: number)
//   cancel()
// device-verify-pending: the module name and per-platform routing are confirmed
// from RN source but not yet exercised on a real iOS/Android host.

import { dlog, getNativeModule, Platform } from '@symbiote/shared'

const VIBRATION_MODULE = 'Vibration'

// RN's _default_vibration_length — the single-buzz duration when no pattern is given,
// and the per-segment buzz length the iOS scheduler emits between waits.
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

// iOS-only JS pattern scheduler state, mirroring RN's _vibrating / _id. `_id`
// guards against a stale timer from a previous run firing into a new one.
let vibrating = false
let scheduleId = 0

// Walk one pattern step: buzz, then arm the next step (or repeat / stop). Bails if
// vibration was canceled (vibrating=false) or superseded by a newer run (id mismatch).
function vibrateScheduler(
  module: NativeVibration,
  id: number,
  pattern: number[],
  repeat: boolean,
  nextIndex: number,
): void {
  if (!vibrating || id !== scheduleId) {
    return
  }
  module.vibrate(DEFAULT_VIBRATION_LENGTH)
  let index = nextIndex
  if (index >= pattern.length) {
    if (repeat) {
      index = 0
    } else {
      vibrating = false
      return
    }
  }
  setTimeout(() => vibrateScheduler(module, id, pattern, repeat, index + 1), pattern[index])
}

// iOS pattern entry point — a leading 0 means "buzz immediately", otherwise the
// first entry is the initial wait before the first buzz.
function vibrateByPatternIos(module: NativeVibration, inputPattern: number[], repeat: boolean): void {
  if (vibrating) {
    return
  }
  vibrating = true
  let pattern = inputPattern
  if (pattern[0] === 0) {
    module.vibrate(DEFAULT_VIBRATION_LENGTH)
    pattern = pattern.slice(1)
  }
  if (pattern.length === 0) {
    vibrating = false
    return
  }
  setTimeout(() => vibrateScheduler(module, ++scheduleId, pattern, repeat, 1), pattern[0])
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
      return
    }
    if (Platform.OS === 'android') {
      dlog(`Vibration.vibrate (android) -> pattern[${pattern.length}], repeat=${repeat}`)
      module.vibrateByPattern(pattern, repeat ? REPEAT_FROM_START : REPEAT_NONE)
      return
    }
    dlog(`Vibration.vibrate (ios) -> pattern[${pattern.length}], repeat=${repeat}`)
    vibrateByPatternIos(module, pattern, repeat)
  },

  // Stop an ongoing vibration. iOS stops the JS scheduler (the next tick bails);
  // both platforms tell native to cancel.
  cancel(): void {
    const module = getModule()
    if (module === null) {
      dlog('Vibration.cancel -> Vibration native module unavailable, no-op')
      return
    }
    dlog('Vibration.cancel')
    vibrating = false
    module.cancel()
  },
}
