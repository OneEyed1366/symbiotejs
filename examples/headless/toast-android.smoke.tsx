// Headless proof of the ToastAndroid module — JS->native only, no simulator. A fake
// __turboModuleProxy returns a ToastAndroid module that records show /
// showWithGravity / showWithGravityAndOffset calls and exposes getConstants. We
// assert each show* forwards its args, the constants surface as numbers, and — with
// NO module faked — the calls are silent no-ops (a missing optional native module
// must never throw). A failure here is in JS, not native.
//
// The module resolves its native module + constants at load time, so the proxy is
// installed BEFORE the dynamic import that pulls it in (a static import would be
// hoisted above the setup and resolve against an empty proxy).

// ---- fake native module --------------------------------------------------

let showArgs: [string, number] | undefined
let gravityArgs: [string, number, number] | undefined
let offsetArgs: [string, number, number, number, number] | undefined

const fakeToast = {
  getConstants: (): Record<string, number> => ({
    SHORT: 0,
    LONG: 1,
    TOP: 48,
    BOTTOM: 80,
    CENTER: 17,
  }),
  show: (message: string, duration: number): void => {
    showArgs = [message, duration]
  },
  showWithGravity: (message: string, duration: number, gravity: number): void => {
    gravityArgs = [message, duration, gravity]
  },
  showWithGravityAndOffset: (
    message: string,
    duration: number,
    gravity: number,
    xOffset: number,
    yOffset: number,
  ): void => {
    offsetArgs = [message, duration, gravity, xOffset, yOffset]
  },
}

const registeredModules: Record<string, unknown> = { ToastAndroid: fakeToast }

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

// Import AFTER the proxy is installed so load-time constant resolution sees the fake.
const { ToastAndroid } = await import('../../adapters/react/src/toast-android')

// (c) constants exposed as numbers.
for (const key of ['SHORT', 'LONG', 'TOP', 'BOTTOM', 'CENTER'] as const) {
  if (typeof ToastAndroid[key] !== 'number') {
    throw new Error(`ToastAndroid.${key} should be a number, got ${typeof ToastAndroid[key]}`)
  }
}

// (a) show forwards (message, duration).
ToastAndroid.show('hello', ToastAndroid.SHORT)
if (showArgs === undefined || showArgs[0] !== 'hello' || showArgs[1] !== ToastAndroid.SHORT) {
  throw new Error(`show should forward (message, duration), got ${String(showArgs)}`)
}

// (b) showWithGravity forwards all args.
ToastAndroid.showWithGravity('grav', ToastAndroid.LONG, ToastAndroid.CENTER)
if (
  gravityArgs === undefined ||
  gravityArgs.join(',') !== `grav,${ToastAndroid.LONG},${ToastAndroid.CENTER}`
) {
  throw new Error(`showWithGravity should forward all args, got ${String(gravityArgs)}`)
}

// (b) showWithGravityAndOffset forwards all args.
ToastAndroid.showWithGravityAndOffset('off', ToastAndroid.SHORT, ToastAndroid.BOTTOM, 25, 50)
if (
  offsetArgs === undefined ||
  offsetArgs.join(',') !== `off,${ToastAndroid.SHORT},${ToastAndroid.BOTTOM},25,50`
) {
  throw new Error(`showWithGravityAndOffset should forward all args, got ${String(offsetArgs)}`)
}

// (d) with NO module faked, calls are silent no-ops (no throw). An empty proxy + a
// fresh module instance exercises the null path independently of the cached one.
Object.assign(globalThis, {
  __turboModuleProxy: <T,>(_name: string): T | null => null,
})

const fresh = await import(`../../adapters/react/src/toast-android?nomodule=${Date.now()}`)
const toast: unknown = fresh.ToastAndroid
if (!isType<typeof ToastAndroid>(toast)) {
  throw new Error('fresh import did not expose ToastAndroid')
}
// None of these may throw with the module absent.
toast.show('x', toast.SHORT)
toast.showWithGravity('x', toast.LONG, toast.CENTER)
toast.showWithGravityAndOffset('x', toast.SHORT, toast.BOTTOM, 1, 2)
for (const key of ['SHORT', 'LONG', 'TOP', 'BOTTOM', 'CENTER'] as const) {
  if (typeof toast[key] !== 'number') {
    throw new Error(`no-module ToastAndroid.${key} should still be a number`)
  }
}

console.log('toast-android.smoke OK')

export {}
