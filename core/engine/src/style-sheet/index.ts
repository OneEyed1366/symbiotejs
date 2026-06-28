// StyleSheet, ported from react-native/Libraries/StyleSheet/StyleSheetExports.js.
// RN's StyleSheet is mostly identity + small helpers: `create` returns the object
// untouched (no deep-freeze by default in modern RN), `flatten` collapses a style
// array, `compose` picks/pairs two styles, plus the `hairlineWidth` / `absoluteFill`
// constants. The typed ViewStyle/TextStyle live next door in styles.ts, so `create`
// is typed against them like RN's, not left generic over a plain Record.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';
import { flattenStyle } from '../style';
import type { INamedStyles, IViewStyle, ITextStyle } from '../styles';

// RN constrains create with `T & NamedStyles<any>` to catch typos; we name the index
// shape concretely instead of `any`: every value must be a real style object.
type IStyleRecord = Record<string, IViewStyle | ITextStyle>;

// A single style object. Generic on purpose: shared is framework-agnostic and must
// not depend on the adapter's typed style maps.
type IStyleObject = Record<string, unknown>;

// RN's hairline factor: a "1 physical pixel" line is ~0.4 logical px, rounded to the
// nearest device pixel. Named so the 0.4 isn't a bare magic number (RN source uses
// the same literal in PixelRatio.roundToNearestPixel(0.4)).
const HAIRLINE_LOGICAL_FACTOR = 0.4;

// Fallback when DeviceInfo isn't resolvable (headless, or before native bring-up).
// RN can't run without it; we degrade to a sane 1px line rather than crash.
const HAIRLINE_FALLBACK = 1;

// The shape we read off DeviceInfo's constants, RN's source of truth for screen
// scale. The key is platform-specific: iOS ships it under Dimensions.window, Android
// under Dimensions.windowPhysicalPixels (the same scale value: toPointSpace divides
// width/height, never scale). Both optional so a missing/renamed key degrades to the
// hairline fallback instead of throwing mid-render. Narrowed at the native trust
// boundary by getNativeModule<T>.
interface IDisplayMetrics {
  scale?: number;
}
interface IDeviceInfoModule {
  getConstants(): {
    Dimensions: { window?: IDisplayMetrics; windowPhysicalPixels?: IDisplayMetrics };
  };
}

// Resolve the screen pixel scale lazily from native, or null when unavailable.
// Lazy (not at import) so this module is importable headless before a fake
// __turboModuleProxy exists, same precedent as StatusBar's in-effect resolve.
function resolveScreenScale(): number | null {
  const deviceInfo = getNativeModule<IDeviceInfoModule>('DeviceInfo');
  if (deviceInfo === null) {
    dlog('StyleSheet: DeviceInfo not resolvable — hairlineWidth falls back');
    return null;
  }
  const dimensions = deviceInfo.getConstants().Dimensions;
  const scale = dimensions.window?.scale ?? dimensions.windowPhysicalPixels?.scale;
  // A non-positive scale would make the round/divide nonsensical; treat as missing.
  if (typeof scale !== 'number' || scale <= 0) {
    dlog(`StyleSheet: DeviceInfo scale invalid (${String(scale)}) — hairlineWidth falls back`);
    return null;
  }
  return scale;
}

// Compute the hairline width for a given scale, mirroring RN exactly: round the
// logical factor to the nearest device pixel, and if that rounds to 0 (scale < ~1.25)
// fall back to the thinnest representable line, one physical pixel = 1 / scale.
// Exported as a pure helper so the smoke can check the formula without faking native.
export function computeHairlineWidth(scale: number): number {
  const rounded = Math.round(HAIRLINE_LOGICAL_FACTOR * scale) / scale;
  return rounded === 0 ? 1 / scale : rounded;
}

// RN freezes absoluteFill in __DEV__; we always freeze so `absoluteFill` and
// `absoluteFillObject` can safely be the same shared object.
const absoluteFill: Readonly<IStyleObject> = Object.freeze({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

// RN's composeStyles: falsy left → right, falsy right → left, else the pair [a, b]
// (which flatten later collapses, later keys winning).
function compose<A, B>(style1: A, style2: B): A | B | [A, B] {
  if (style1 === null || style1 === undefined) return style2;
  if (style2 === null || style2 === undefined) return style1;
  return [style1, style2];
}

// Per-attribute style preprocessors, keyed by property name. RN keeps these in
// ReactNativeStyleAttributes and runs them as a value passes to native; here the
// registry is consulted by `flatten` (the one place a style collapses to the flat
// payload before commit), so a registered process() rewrites the matching key.
type IStylePreprocessor = (value: unknown) => unknown;
const stylePreprocessors = new Map<string, IStylePreprocessor>();

// Register a value-rewriter for one style property (RN's setStyleAttributePreprocessor,
// StyleSheetExports.js:151). EXPERIMENTAL in RN; used internally for color/transform.
// Overwriting an existing preprocessor warns, matching RN's __DEV__ guard.
function setStyleAttributePreprocessor(property: string, process: IStylePreprocessor): void {
  if (stylePreprocessors.has(property)) {
    dlog(`StyleSheet.setStyleAttributePreprocessor: overwriting "${property}" preprocessor`);
  }
  stylePreprocessors.set(property, process);
}

// Flatten, then run any registered preprocessor over the matching keys. Kept as a
// wrapper over the single flattenStyle collapse so the preprocessor map is applied
// exactly once, at the same seam RN applies it (the style->payload boundary), without
// reaching into the commit path.
function flattenWithPreprocessors(style: unknown): Record<string, unknown> {
  const flat = flattenStyle(style);
  if (stylePreprocessors.size === 0) return flat;
  for (const [property, process] of stylePreprocessors) {
    if (Object.hasOwn(flat, property)) {
      flat[property] = process(flat[property]);
    }
  }
  return flat;
}

// Snap a dp size to the nearest value that maps to a whole number of device pixels.
// RN's StyleSheet.roundToNearestPixel delegates to PixelRatio.roundToNearestPixel
// (Math.round(size * scale) / scale). PixelRatio lives in the react adapter, which
// shared cannot import, so the same math runs here over the scale shared already
// resolves; an unresolvable scale (headless) leaves the value unrounded.
function roundToNearestPixel(value: number): number {
  const scale = resolveScreenScale();
  if (scale === null) return value;
  return Math.round(value * scale) / scale;
}

export const StyleSheet = {
  // Identity at runtime, like RN, but the NamedStyles constraint preserves each
  // string-literal style value (flexDirection: 'row' stays 'row', not string) and
  // validates entries, so `styles.box` is assignable to a ViewStyle prop.
  create<T extends INamedStyles<T> | IStyleRecord>(styles: T & IStyleRecord): T {
    return styles;
  },

  // Reuse the single flatten implementation; do not reimplement the clone-on-write
  // collapse here. The wrapper additionally applies any registered per-attribute
  // preprocessor as the style collapses to its flat payload.
  flatten: flattenWithPreprocessors,

  compose,

  setStyleAttributePreprocessor,
  roundToNearestPixel,

  absoluteFill,
  absoluteFillObject: absoluteFill,

  // Lazy compute, recomputed each read (cheap, and avoids caching a fallback taken
  // before native was ready). RN memoizes; we keep it simple until that's a cost.
  get hairlineWidth(): number {
    const scale = resolveScreenScale();
    if (scale === null) return HAIRLINE_FALLBACK;
    return computeHairlineWidth(scale);
  },
};
