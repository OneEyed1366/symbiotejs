// Headless proof of the Vibration module — JS->native only, no simulator. A fake
// __turboModuleProxy returns a Vibration module that records vibrate /
// vibrateByPattern / cancel calls. We assert both platform branches:
//   - iOS (default): a number dispatches to native vibrate, and an array drives the
//     JS setTimeout scheduler (its first segment buzzes via native vibrate).
//   - Android (Platform.OS flipped): an array dispatches to native vibrateByPattern
//     with the correct repeat arg.
// Plus cancel reaches native cancel, and a missing module is a silent no-op.
// A failure here is in JS, not native.

import { Platform } from '@symbiote/shared'
import { Vibration } from '../../packages/react/src/vibration'

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

// ---- iOS branch (default Platform.OS) ------------------------------------

// Default (number) -> native vibrate.
Vibration.vibrate()
if (vibrateArg !== 400) {
  throw new Error(`vibrate() should call native vibrate(400), got ${String(vibrateArg)}`)
}

// Array on iOS -> JS setTimeout scheduler, NOT vibrateByPattern. A leading 0 buzzes
// the first segment immediately via native vibrate(400); native vibrateByPattern
// must stay untouched.
vibrateArg = undefined
Vibration.vibrate([0, 100, 200])
if (vibrateArg !== 400) {
  throw new Error(`vibrate(array) on iOS should buzz the first segment via vibrate(400), got ${String(vibrateArg)}`)
}
if (patternArg !== undefined) {
  throw new Error('vibrate(array) on iOS must NOT call native vibrateByPattern (JS scheduler owns the pattern)')
}

// Cancel stops the iOS scheduler and reaches native cancel.
Vibration.cancel()
if (!canceled) throw new Error('cancel() should call native cancel()')

// ---- Android branch (Platform.OS flipped) --------------------------------

// Platform.OS is a runtime const object; defineProperty rewrites it without a cast.
Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })

// Array on Android, no repeat -> native vibrateByPattern(pattern, -1).
patternArg = undefined
patternRepeatArg = undefined
Vibration.vibrate([0, 100, 200])
if (patternArg === undefined || patternArg.join(',') !== '0,100,200') {
  throw new Error(`vibrate(array) on Android should call vibrateByPattern with the pattern, got ${String(patternArg)}`)
}
if (patternRepeatArg !== -1) {
  throw new Error(`vibrate(array) without repeat should pass -1, got ${String(patternRepeatArg)}`)
}

// Array on Android, repeat=true -> native vibrateByPattern(pattern, 0).
patternRepeatArg = undefined
Vibration.vibrate([0, 100, 200], true)
if (patternRepeatArg !== 0) {
  throw new Error(`vibrate(array, true) should pass repeat 0, got ${String(patternRepeatArg)}`)
}

// Restore the default platform so later smokes see iOS.
Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })

// ---- missing module -> silent no-op --------------------------------------

// An empty proxy + a fresh module instance exercises the null path independently of
// the cached one. None of these may throw with the module absent.
Object.assign(globalThis, {
  __turboModuleProxy: <T,>(_name: string): T | null => null,
})

const fresh = await import(`../../packages/react/src/vibration?nomodule=${Date.now()}`)
const vibration: unknown = fresh.Vibration
if (!isType<typeof Vibration>(vibration)) {
  throw new Error('fresh import did not expose Vibration')
}
vibration.vibrate(50)
vibration.vibrate([0, 100])
vibration.cancel()

console.log('vibration.smoke OK')

export {}
