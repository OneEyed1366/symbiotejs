// Vibration — Android build. Android has a native pattern scheduler, so the whole pattern
// goes to native `vibrateByPattern(pattern, repeat)` — RN encodes "do not repeat" as -1
// and "repeat from start" as 0. Everything else is the shared core. Metro picks this file
// on an Android host.
//
// device-verify-pending: the `Vibration` name and the `vibrateByPattern` routing are
// confirmed from RN source but not yet exercised on a real Android host — only a
// bridgeless resolution log there can prove the name. See
// .docs/native-module-platform-routing.md.

import { createVibration } from './vibration-shared'

export type { NativeVibration, VibrationStatic } from './vibration-shared'

// RN encodes "do not repeat" as -1 and "repeat from start" as 0 in vibrateByPattern.
const REPEAT_NONE = -1
const REPEAT_FROM_START = 0

export const Vibration = createVibration({
  vibratePattern: (module, pattern, repeat) => {
    module.vibrateByPattern(pattern, repeat ? REPEAT_FROM_START : REPEAT_NONE)
  },
})
