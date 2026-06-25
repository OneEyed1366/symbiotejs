// Headless proof of the screen-metrics modules — Dimensions, PixelRatio, and the
// useWindowDimensions hook — no simulator. A fake __turboModuleProxy returns a
// DeviceInfo module whose getConstants() ships known window metrics; a fake
// RN$registerCallableModule captures the device hub so the test can play "native"
// and emit a 'didUpdateDimensions' update. We assert the cached metrics, the
// PixelRatio math, and that a 'change' listener fires with the fresh metrics. A
// failure here is in JS, not native.

// Reach the sources directly — the barrel is wired by the parent, the headless
// harness has no built dist.
import { Dimensions } from '../../adapters/react/src/dimensions'
import { PixelRatio } from '../../adapters/react/src/pixel-ratio'
import { useWindowDimensions } from '../../adapters/react/src/use-window-dimensions'

// ---- fake native-module + device-hub globals ----------------------------

const INITIAL_WINDOW = { width: 400, height: 800, scale: 3, fontScale: 2 }

const fakeDeviceInfo = {
  getConstants: (): { Dimensions: { window: typeof INITIAL_WINDOW } } => ({
    Dimensions: { window: INITIAL_WINDOW },
  }),
}
const registeredModules: Record<string, unknown> = { DeviceInfo: fakeDeviceInfo }

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  // Trailing comma on the type param: in a .tsx file a bare <T> reads as JSX.
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory()
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- case 1: initial metrics + PixelRatio math --------------------------

if (Dimensions.get('window').width !== 400) {
  throw new Error(`expected window width 400, got ${Dimensions.get('window').width}`)
}
// iOS gives no `screen` — it must mirror the window (RN's screen ??= window).
if (Dimensions.get('screen').width !== 400) {
  throw new Error(`expected screen to mirror window (400), got ${Dimensions.get('screen').width}`)
}
if (PixelRatio.get() !== 3) {
  throw new Error(`expected PixelRatio.get() 3, got ${PixelRatio.get()}`)
}
if (PixelRatio.getFontScale() !== 2) {
  throw new Error(`expected fontScale 2, got ${PixelRatio.getFontScale()}`)
}
if (PixelRatio.getPixelSizeForLayoutSize(10) !== 30) {
  throw new Error(`expected getPixelSizeForLayoutSize(10) 30, got ${PixelRatio.getPixelSizeForLayoutSize(10)}`)
}
{
  const expected = Math.round(8.333 * 3) / 3
  if (PixelRatio.roundToNearestPixel(8.333) !== expected) {
    throw new Error(
      `expected roundToNearestPixel(8.333) ${expected}, got ${PixelRatio.roundToNearestPixel(8.333)}`,
    )
  }
}

// ---- case 2: 'change' listener fires on a native update -----------------

if (deviceHub === undefined) {
  throw new Error('Dimensions must install the device hub on first resolve')
}
const hub = deviceHub

let changed: { window: { width: number } } | undefined
const sub = Dimensions.addEventListener('change', (set) => {
  changed = set
})

const NEXT_WINDOW = { width: 500, height: 900, scale: 3, fontScale: 2 }
hub.emit('didUpdateDimensions', { window: NEXT_WINDOW })

if (changed === undefined) {
  throw new Error("'change' listener did not fire on didUpdateDimensions")
}
if (changed.window.width !== 500) {
  throw new Error(`'change' payload window width should be 500, got ${changed.window.width}`)
}
if (Dimensions.get('window').width !== 500) {
  throw new Error(`cache should update to 500 after didUpdateDimensions, got ${Dimensions.get('window').width}`)
}

// A removed listener must not fire again.
changed = undefined
sub.remove()
hub.emit('didUpdateDimensions', { window: { width: 600, height: 900, scale: 3, fontScale: 2 } })
if (changed !== undefined) {
  throw new Error('a removed change-listener must not fire')
}
// The cache still tracks the latest update even with no listeners.
if (Dimensions.get('window').width !== 600) {
  throw new Error(`cache should track latest update (600), got ${Dimensions.get('window').width}`)
}

// ---- case 3: the hook surface is exercised structurally -----------------

// A unit-level check: the hook reads the same Dimensions cache get() returns. We
// don't spin up a renderer here (the other smokes own the mount path); calling the
// hook outside React would violate the rules-of-hooks, so we assert the contract it
// stands on — get('window') is the source it seeds and re-checks from.
if (typeof useWindowDimensions !== 'function') {
  throw new Error('useWindowDimensions must be a function')
}
if (Dimensions.get('window').width !== 600) {
  throw new Error('useWindowDimensions seeds from Dimensions.get(window), which must be current')
}

console.log('dimensions.smoke OK')
