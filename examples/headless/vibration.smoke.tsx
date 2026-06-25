// Headless proof of the Vibration module — JS->native only, no simulator. Per ADR 0019
// the platform builds are separate files (vibration.ios.ts / vibration.android.ts), so
// this imports each DIRECTLY — no Metro, no runtime Platform.OS toggle. A fake
// __turboModuleProxy returns a Vibration module that records vibrate / vibrateByPattern /
// cancel calls. We assert:
//   - iOS: a number dispatches to native vibrate, and an array drives the JS setTimeout
//     scheduler (its first segment buzzes via native vibrate, NOT vibrateByPattern).
//   - Android: an array dispatches to native vibrateByPattern with the correct repeat arg.
//   - cancel reaches native cancel; a missing module is a silent no-op.
// A failure here is in JS, not native.

import { Vibration as IosVibration } from '../../adapters/react/src/vibration.ios'
import { Vibration as AndroidVibration } from '../../adapters/react/src/vibration.android'
import { createVibration } from '../../adapters/react/src/vibration-shared'

// ---- fake native module --------------------------------------------------

let vibrateArg: number | undefined
let patternArg: number[] | undefined
let patternRepeatArg: number | undefined
let canceled = false

const fakeVibration = {
  vibrate: (pattern: number): void => {
    vibrateArg = pattern
  },
  vibrateByPattern: (pattern: number[], repeat: number): void => {
    patternArg = pattern
    patternRepeatArg = repeat
  },
  cancel: (): void => {
    canceled = true
  },
}

const registeredModules: Record<string, unknown> = { Vibration: fakeVibration }

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- iOS build — single number + JS scheduler ----------------------------

// Default (number) -> native vibrate.
IosVibration.vibrate()
if (vibrateArg !== 400) {
  throw new Error(`iOS vibrate() should call native vibrate(400), got ${String(vibrateArg)}`)
}

// Array on iOS -> JS setTimeout scheduler, NOT vibrateByPattern. A leading 0 buzzes the
// first segment immediately via native vibrate(400); native vibrateByPattern must stay
// untouched.
vibrateArg = undefined
IosVibration.vibrate([0, 100, 200])
if (vibrateArg !== 400) {
  throw new Error(`iOS vibrate(array) should buzz the first segment via vibrate(400), got ${String(vibrateArg)}`)
}
if (patternArg !== undefined) {
  throw new Error('iOS vibrate(array) must NOT call native vibrateByPattern (JS scheduler owns the pattern)')
}

// Cancel stops the iOS scheduler and reaches native cancel.
IosVibration.cancel()
if (!canceled) throw new Error('iOS cancel() should call native cancel()')

// ---- Android build — native vibrateByPattern -----------------------------

// Array on Android, no repeat -> native vibrateByPattern(pattern, -1).
patternArg = undefined
patternRepeatArg = undefined
AndroidVibration.vibrate([0, 100, 200])
if (patternArg === undefined || patternArg.join(',') !== '0,100,200') {
  throw new Error(`Android vibrate(array) should call vibrateByPattern with the pattern, got ${String(patternArg)}`)
}
if (patternRepeatArg !== -1) {
  throw new Error(`Android vibrate(array) without repeat should pass -1, got ${String(patternRepeatArg)}`)
}

// Array on Android, repeat=true -> native vibrateByPattern(pattern, 0).
patternRepeatArg = undefined
AndroidVibration.vibrate([0, 100, 200], true)
if (patternRepeatArg !== 0) {
  throw new Error(`Android vibrate(array, true) should pass repeat 0, got ${String(patternRepeatArg)}`)
}

// Android cancel reaches native cancel too.
canceled = false
AndroidVibration.cancel()
if (!canceled) throw new Error('Android cancel() should call native cancel()')

// ---- missing module -> silent no-op --------------------------------------

// A fresh Vibration built under a null proxy exercises the absent-module path. None of
// these may throw with the module gone, and the pattern strategy must never run.
Object.assign(globalThis, {
  __turboModuleProxy: <T,>(_name: string): T | null => null,
})
const nullProxyVibration = createVibration({
  vibratePattern: () => {
    throw new Error('vibratePattern must not run when the native module is absent')
  },
})
nullProxyVibration.vibrate(50)
nullProxyVibration.vibrate([0, 100])
nullProxyVibration.cancel()

console.log('vibration.smoke OK')

export {}
