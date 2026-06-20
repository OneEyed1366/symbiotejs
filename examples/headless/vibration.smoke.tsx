// Headless proof of the Vibration module — JS->native only, no simulator. A fake
// __turboModuleProxy returns a Vibration module that records vibrate /
// vibrateByPattern / cancel calls. We assert a number dispatches to vibrate, an
// array dispatches to vibrateByPattern with the pattern, and cancel reaches cancel.
// A failure here is in JS, not native.

import { Vibration } from '../../packages/react/src/vibration'

// ---- fake native module --------------------------------------------------

let vibrateArg: number | undefined
let patternArg: number[] | undefined
let canceled = false

const fakeVibration = {
  vibrate: (pattern: number): void => {
    vibrateArg = pattern
  },
  vibrateByPattern: (pattern: number[], _repeat: number): void => {
    patternArg = pattern
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

// ---- the smoke ----------------------------------------------------------

// Default (number) -> native vibrate.
Vibration.vibrate()
if (vibrateArg !== 400) {
  throw new Error(`vibrate() should call native vibrate(400), got ${String(vibrateArg)}`)
}

// Array -> native vibrateByPattern with the pattern.
Vibration.vibrate([0, 100, 200])
if (patternArg === undefined || patternArg.join(',') !== '0,100,200') {
  throw new Error(`vibrate(array) should call vibrateByPattern with the pattern, got ${String(patternArg)}`)
}

// cancel -> native cancel.
Vibration.cancel()
if (!canceled) throw new Error('cancel() should call native cancel()')

console.log('vibration.smoke OK')
