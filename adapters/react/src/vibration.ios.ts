// Vibration — iOS build. iOS has no native pattern scheduler, so per RN's Vibration.js we
// walk the segments JS-side with setTimeout (buzz, wait, buzz, …), looping when `repeat`.
// Everything else — the single-number buzz, cancel, the module resolver — is the shared
// core. Metro picks this file on an iOS host; the base vibration.ts re-exports it for
// web/headless.

import {
  createVibration,
  DEFAULT_VIBRATION_LENGTH,
  type NativeVibration,
} from './vibration-shared'

export type { NativeVibration, VibrationStatic } from './vibration-shared'

// JS scheduler state, mirroring RN's _vibrating / _id. `scheduleId` guards against a
// stale timer from a previous run firing into a new one.
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

// iOS pattern entry point — a leading 0 means "buzz immediately", otherwise the first
// entry is the initial wait before the first buzz.
function vibratePattern(module: NativeVibration, inputPattern: number[], repeat: boolean): void {
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

export const Vibration = createVibration({
  vibratePattern,
  // cancel stops the JS scheduler: the next tick sees vibrating=false and bails.
  stopPattern: () => {
    vibrating = false
  },
})
