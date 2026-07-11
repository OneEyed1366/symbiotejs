// Screen metrics: a faithful, iOS-first port of React Native's
// Libraries/Utilities/Dimensions.js. Native ships initial window/screen metrics in
// the DeviceInfo module's getConstants().Dimensions, and pushes later updates (e.g.
// rotation, font-scale change) through the device hub as a 'didUpdateDimensions'
// event whose payload IS a fresh IDimensionsPayload. We cache the metrics and notify
// 'change' listeners on each update, exactly as RN does.
//
// The native contract mirrors React Native's TurboModule spec for DeviceInfo:
//   getConstants(): { Dimensions: { window?, screen?, windowPhysicalPixels?,
//                     screenPhysicalPixels? } }
// We resolve it through the same generic native-module bridge as Platform
// (getNativeModule), so this module stays importable headless before a fake proxy
// is installed.

import { createDeviceEventModule } from '../native-modules';
import { type IEventSubscription } from '../native-events';
import { dlog } from '../debug';
import { isRecord } from '../type-guards';

// The native module name RN registers device metrics under.
const DEVICE_INFO_MODULE = 'DeviceInfo';

// The device event native emits when metrics change; its payload is a fresh
// IDimensionsPayload (INativeDeviceInfo / Dimensions.js subscribe to this name).
const DID_UPDATE_DIMENSIONS = 'didUpdateDimensions';

// Used when the native module is unresolvable (headless, or a binary without it):
// RN's getConstants() would throw, but a Dimensions read must never crash a render.
// A scale of 1 is the neutral "non-retina" default PixelRatio falls back to.
const DEFAULT_SCALE = 1;

const ZERO_METRICS: IDisplayMetrics = {
  width: 0,
  height: 0,
  scale: DEFAULT_SCALE,
  fontScale: DEFAULT_SCALE,
};

// One set of metrics for a display. iOS gives width/height in points plus the pixel
// `scale` and the user's `fontScale`.
export interface IDisplayMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

// Android additionally reports raw density. Kept for payload fidelity; iOS omits it.
export interface IDisplayMetricsAndroid extends IDisplayMetrics {
  densityDpi: number;
}

// What native sends, both in getConstants().Dimensions and in the
// 'didUpdateDimensions' payload. iOS fills window/screen; Android sends the
// *PhysicalPixels variants which we divide by scale into points (mirrors RN).
export interface IDimensionsPayload {
  window?: IDisplayMetrics;
  screen?: IDisplayMetrics;
  windowPhysicalPixels?: IDisplayMetricsAndroid;
  screenPhysicalPixels?: IDisplayMetricsAndroid;
}

// The resolved, point-space metrics Dimensions.get() hands back.
export interface IDimensionsSet {
  window: IDisplayMetrics;
  screen: IDisplayMetrics;
}

export type IDimensionsKey = keyof IDimensionsSet;

export type IDimensionsChangeListener = (set: IDimensionsSet) => void;

// The native DeviceInfo module: the single method we consume.
interface INativeDeviceInfo {
  getConstants(): { Dimensions: IDimensionsPayload };
}

// The trust boundary: native getConstants() crosses from an untyped HostObject into
// our types here, behind a structural guard (no per-call cast). A shape that fails
// the guard is treated as "module absent".

function isDimensionsConstants(value: unknown): value is { Dimensions: IDimensionsPayload } {
  return isRecord(value) && isRecord(value.Dimensions);
}

function isDimensionsPayload(value: unknown): value is IDimensionsPayload {
  return isRecord(value);
}

const changeListeners = new Set<IDimensionsChangeListener>();

// Cached, resolved metrics. `undefined` = not yet set, so we know to swallow the
// first 'change' (RN's dimensionsInitialized flag: native pushes an initial set we
// must not surface as a change).
let cached: IDimensionsSet | undefined;

// Derive point-space metrics from a payload, mirroring Dimensions.set(): the Android
// *PhysicalPixels variants divide by scale into points; absent a screen, it mirrors
// the window.
function resolveMetrics(payload: IDimensionsPayload): IDimensionsSet {
  let window = payload.window;
  if (payload.windowPhysicalPixels !== undefined) {
    window = toPointSpace(payload.windowPhysicalPixels);
  }

  let screen = payload.screen;
  if (payload.screenPhysicalPixels !== undefined) {
    screen = toPointSpace(payload.screenPhysicalPixels);
  } else if (screen === undefined) {
    screen = window;
  }

  return {
    window: window ?? ZERO_METRICS,
    screen: screen ?? window ?? ZERO_METRICS,
  };
}

function toPointSpace(pixels: IDisplayMetricsAndroid): IDisplayMetrics {
  return {
    width: pixels.width / pixels.scale,
    height: pixels.height / pixels.scale,
    scale: pixels.scale,
    fontScale: pixels.fontScale,
  };
}

// Apply a fresh payload and notify 'change' subscribers, except the very first
// set, which seeds the cache without firing (the initial native push is not a
// "change"). This is the sink for both getConstants() and 'didUpdateDimensions'.
function setDimensions(payload: IDimensionsPayload): void {
  const isFirst = cached === undefined;
  cached = resolveMetrics(payload);
  if (isFirst) return;
  dlog(`Dimensions: 'change' -> window ${cached.window.width}x${cached.window.height}`);
  for (const listener of [...changeListeners]) listener(cached);
}

// The policy that diverges from a plain lazy-resolve+emitter: DeviceInfo carries no
// observe-counters (only getConstants), so it never binds into the emitter -
// bindModuleToEmitter stays false, matching the original `new
// NativeEventEmitter(undefined)`. And the subscribe-BEFORE-reading-constants order
// (native could push an update between the two, RN orders addListener before
// getConstants for the same reason) lives in onEmitterCreated, which runs addListener
// first and only then touches getConstants() - same order as before the extraction.
const deviceEventModule = createDeviceEventModule<INativeDeviceInfo>({
  moduleName: DEVICE_INFO_MODULE,
  moduleLogPrefix: 'Dimensions: module',
  bindModuleToEmitter: false,
  onEmitterCreated: (emitter, module) => {
    emitter.addListener(DID_UPDATE_DIMENSIONS, payload => {
      if (isDimensionsPayload(payload)) setDimensions(payload);
    });

    if (module === null) {
      dlog('Dimensions: DeviceInfo not resolvable via native bridge — using zero metrics');
    } else {
      const constants: unknown = module.getConstants();
      if (isDimensionsConstants(constants)) {
        dlog('Dimensions: resolved initial metrics from DeviceInfo.getConstants()');
        setDimensions(constants.Dimensions);
      } else {
        dlog(
          'Dimensions: DeviceInfo.getConstants() returned an unexpected shape — using zero metrics',
        );
      }
    }
  },
});

// Resolve initial metrics lazily and subscribe to native updates once. Re-attempts
// on each call until a valid module is cached, so a later-installed DeviceInfo still
// gets picked up (same pattern as platform.ts).
function ensureResolved(): IDimensionsSet {
  if (cached !== undefined) return cached;
  deviceEventModule.getEmitter();
  return cached ?? { window: ZERO_METRICS, screen: ZERO_METRICS };
}

export interface IDimensionsStatic {
  get(dim: IDimensionsKey): IDisplayMetrics;
  set(dims: IDimensionsPayload): void;
  addEventListener(type: 'change', listener: IDimensionsChangeListener): IEventSubscription;
}

export const Dimensions: IDimensionsStatic = {
  get(dim: IDimensionsKey): IDisplayMetrics {
    return ensureResolved()[dim];
  },

  // RN exposes this as a public static (Dimensions.js:63); native pushes metrics
  // through it. Delegates to the internal setter, which caches and fires 'change'.
  set(dims: IDimensionsPayload): void {
    setDimensions(dims);
  },

  // `_type` is fixed to 'change' for RN signature parity; Dimensions emits no other.
  addEventListener(_type: 'change', listener: IDimensionsChangeListener): IEventSubscription {
    // Resolve on first subscribe too, so the native update bridge is wired even if
    // get() was never called first.
    ensureResolved();
    changeListeners.add(listener);
    let removed = false;
    return {
      remove: () => {
        if (removed) return;
        removed = true;
        changeListeners.delete(listener);
      },
    };
  },
};
