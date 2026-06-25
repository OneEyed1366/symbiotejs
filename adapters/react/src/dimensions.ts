// Screen metrics — a faithful, iOS-first port of React Native's
// Libraries/Utilities/Dimensions.js. Native ships initial window/screen metrics in
// the DeviceInfo module's getConstants().Dimensions, and pushes later updates (e.g.
// rotation, font-scale change) through the device hub as a 'didUpdateDimensions'
// event whose payload IS a fresh DimensionsPayload. We cache the metrics and notify
// 'change' listeners on each update, exactly as RN does.
//
// The native contract is confirmed from RN's TurboModule spec at
// .vendors/.../specs_DEPRECATED/modules/NativeDeviceInfo.js:
//   getConstants(): { Dimensions: { window?, screen?, windowPhysicalPixels?,
//                     screenPhysicalPixels? } }
// We resolve it through the same generic native-module bridge as Platform
// (getNativeModule), so this module stays importable headless before a fake proxy
// is installed.

import {
  getNativeModule,
  installDeviceEventHub,
  NativeEventEmitter,
  dlog,
  type EventSubscription,
} from '@symbiote/engine'

// The native module name RN registers device metrics under.
const DEVICE_INFO_MODULE = 'DeviceInfo'

// The device event native emits when metrics change; its payload is a fresh
// DimensionsPayload (NativeDeviceInfo / Dimensions.js subscribe to this name).
const DID_UPDATE_DIMENSIONS = 'didUpdateDimensions'

// Used when the native module is unresolvable (headless, or a binary without it):
// RN's getConstants() would throw, but a Dimensions read must never crash a render.
// A scale of 1 is the neutral "non-retina" default PixelRatio falls back to.
const DEFAULT_SCALE = 1

const ZERO_METRICS: DisplayMetrics = {
  width: 0,
  height: 0,
  scale: DEFAULT_SCALE,
  fontScale: DEFAULT_SCALE,
}

// One set of metrics for a display. iOS gives width/height in points plus the pixel
// `scale` and the user's `fontScale`.
export interface DisplayMetrics {
  width: number
  height: number
  scale: number
  fontScale: number
}

// Android additionally reports raw density. Kept for payload fidelity; iOS omits it.
export interface DisplayMetricsAndroid extends DisplayMetrics {
  densityDpi: number
}

// What native sends, both in getConstants().Dimensions and in the
// 'didUpdateDimensions' payload. iOS fills window/screen; Android sends the
// *PhysicalPixels variants which we divide by scale into points (mirrors RN).
export interface DimensionsPayload {
  window?: DisplayMetrics
  screen?: DisplayMetrics
  windowPhysicalPixels?: DisplayMetricsAndroid
  screenPhysicalPixels?: DisplayMetricsAndroid
}

// The resolved, point-space metrics Dimensions.get() hands back.
export interface DimensionsSet {
  window: DisplayMetrics
  screen: DisplayMetrics
}

export type DimensionsKey = keyof DimensionsSet

export type DimensionsChangeListener = (set: DimensionsSet) => void

// The native DeviceInfo module — the single method we consume.
interface NativeDeviceInfo {
  getConstants(): { Dimensions: DimensionsPayload }
}

// The trust boundary: native getConstants() crosses from an untyped HostObject into
// our types here, behind a structural guard (no per-call cast). A shape that fails
// the guard is treated as "module absent".
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDimensionsConstants(value: unknown): value is { Dimensions: DimensionsPayload } {
  return isRecord(value) && isRecord(value.Dimensions)
}

function isDimensionsPayload(value: unknown): value is DimensionsPayload {
  return isRecord(value)
}

const changeListeners = new Set<DimensionsChangeListener>()

// Cached, resolved metrics. `undefined` = not yet set, so we know to swallow the
// first 'change' (RN's dimensionsInitialized flag: native pushes an initial set we
// must not surface as a change).
let cached: DimensionsSet | undefined

// Derive point-space metrics from a payload, mirroring Dimensions.set(): the Android
// *PhysicalPixels variants divide by scale into points; absent a screen, it mirrors
// the window.
function resolveMetrics(payload: DimensionsPayload): DimensionsSet {
  let window = payload.window
  if (payload.windowPhysicalPixels !== undefined) {
    window = toPointSpace(payload.windowPhysicalPixels)
  }

  let screen = payload.screen
  if (payload.screenPhysicalPixels !== undefined) {
    screen = toPointSpace(payload.screenPhysicalPixels)
  } else if (screen === undefined) {
    screen = window
  }

  return {
    window: window ?? ZERO_METRICS,
    screen: screen ?? window ?? ZERO_METRICS,
  }
}

function toPointSpace(pixels: DisplayMetricsAndroid): DisplayMetrics {
  return {
    width: pixels.width / pixels.scale,
    height: pixels.height / pixels.scale,
    scale: pixels.scale,
    fontScale: pixels.fontScale,
  }
}

// Apply a fresh payload and notify 'change' subscribers — except the very first
// set, which seeds the cache without firing (the initial native push is not a
// "change"). This is the sink for both getConstants() and 'didUpdateDimensions'.
function setDimensions(payload: DimensionsPayload): void {
  const isFirst = cached === undefined
  cached = resolveMetrics(payload)
  if (isFirst) return
  dlog(`Dimensions: 'change' -> window ${cached.window.width}x${cached.window.height}`)
  for (const listener of [...changeListeners]) listener(cached)
}

// Resolve initial metrics lazily and subscribe to native updates once. Re-attempts
// on each call until a valid module is cached, so a later-installed DeviceInfo still
// gets picked up (same pattern as platform.ts).
let updateSubscription: EventSubscription | undefined

function ensureResolved(): DimensionsSet {
  if (cached !== undefined) return cached

  // Subscribe BEFORE reading constants so an update fired in between isn't missed
  // (RN orders the addListener before the getConstants call for the same reason).
  if (updateSubscription === undefined) {
    const module = getNativeModule<NativeDeviceInfo>(DEVICE_INFO_MODULE)
    installDeviceEventHub()
    const emitter = new NativeEventEmitter(undefined)
    updateSubscription = emitter.addListener(DID_UPDATE_DIMENSIONS, (payload) => {
      if (isDimensionsPayload(payload)) setDimensions(payload)
    })

    if (module === null) {
      dlog('Dimensions: DeviceInfo not resolvable via native bridge — using zero metrics')
    } else {
      const constants: unknown = module.getConstants()
      if (isDimensionsConstants(constants)) {
        dlog('Dimensions: resolved initial metrics from DeviceInfo.getConstants()')
        setDimensions(constants.Dimensions)
      } else {
        dlog('Dimensions: DeviceInfo.getConstants() returned an unexpected shape — using zero metrics')
      }
    }
  }

  return cached ?? { window: ZERO_METRICS, screen: ZERO_METRICS }
}

export interface DimensionsStatic {
  get(dim: DimensionsKey): DisplayMetrics
  set(dims: DimensionsPayload): void
  addEventListener(type: 'change', listener: DimensionsChangeListener): EventSubscription
}

export const Dimensions: DimensionsStatic = {
  get(dim: DimensionsKey): DisplayMetrics {
    return ensureResolved()[dim]
  },

  // RN exposes this as a public static (Dimensions.js:63); native pushes metrics
  // through it. Delegates to the internal setter, which caches and fires 'change'.
  set(dims: DimensionsPayload): void {
    setDimensions(dims)
  },

  // `_type` is fixed to 'change' for RN signature parity; Dimensions emits no other.
  addEventListener(_type: 'change', listener: DimensionsChangeListener): EventSubscription {
    // Resolve on first subscribe too, so the native update bridge is wired even if
    // get() was never called first.
    ensureResolved()
    changeListeners.add(listener)
    let removed = false
    return {
      remove: () => {
        if (removed) return
        removed = true
        changeListeners.delete(listener)
      },
    }
  },
}
