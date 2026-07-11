// Fabric-prop translation: turn a retained node's logical props into the flat payload
// Fabric's C++ props expect. Split out of commit.ts (which owns the reconciler/mirror walk
// + the imperative instance API, neither of which this half touches) so the two
// responsibilities stop sharing one 300+ line file. Color processing itself lives in
// ./platform-color (the stable leaf every color-touching module imports from); this file only
// decides WHICH props are color props and wires the structured CSS-style processors.

import type { IFabricProps } from './fabric';
import { RAW_TEXT_COMPONENT, type ISymbioteNode } from './node';
import { flattenStyle } from './style';
import { registeredProcessor } from './registry';
import { isProcessableColor, processColor } from './platform-color';
import { processBoxShadow } from './process-box-shadow';
import { processFilter } from './process-filter';
import { processTransformOrigin } from './process-transform-origin';
import { processTransform } from './process-transform';
import { processAspectRatio } from './process-aspect-ratio';
import { processFontVariant } from './process-font-variant';
import { processBackgroundImage } from './process-background-image';
import { isRecord, isString } from './type-guards';

// Color props must reach Fabric as platform ints, not CSS strings. Fabric's C++
// color parser silently drops strings. The actual conversion (processColor) is
// RN-platform-specific, so it is injected in platform-color.ts rather than imported,
// keeping shared free of a react-native dependency (and the headless harness working).
const COLOR_PROPS: ReadonlySet<string> = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  // Logical (writing-direction-relative) border colors + the block axis, all wired to
  // processColor in RN's ReactNativeStyleAttributes. borderStartColor/borderEndColor are
  // even publicly typed ColorValue, so they silently dropped on iOS / threw on Android.
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'shadowColor',
  // Text shadow + the W3C `outline`/image `overlay` colors, also processColor in RN.
  'textShadowColor',
  'overlayColor',
  'outlineColor',
  'tintColor',
  // TextInput color props. iOS's native input accepts a CSS string, but Android's
  // AndroidTextInput is strict ("ColorValue: the value must be a number or Object"),
  // so these must be processColor'd here too, same as any other color reaching Fabric.
  'placeholderTextColor',
  'selectionColor',
  'cursorColor',
  'underlineColorAndroid',
  // Text decoration color (underline/strike): same Fabric strictness as any color.
  'textDecorationColor',
  'selectionHandleColor',
  // Switch track/thumb colors. RN processColors each via the Switch ViewConfig
  // (SwitchNativeComponent / AndroidSwitchNativeComponent validAttributes). iOS takes
  // onTintColor (ON) / tintColor (OFF); Android takes trackColorForTrue/False +
  // trackTintColor, and Android's ColorPropConverter is strict ("the value must be a
  // number or Object"), so a raw CSS string crashes. thumbTintColor reaches both.
  'onTintColor',
  'thumbTintColor',
  'trackColorForTrue',
  'trackColorForFalse',
  'trackTintColor',
]);

// Structured CSS-style keys RN parses in JS before native (boxShadow/filter register
// with enableNativeCSSParsing(), which DEFAULTS TO FALSE, so native CSS parsing is off
// and the raw string is dropped). Each runs on the hoisted top-level style key, turning
// a CSS string or structured array into the processed array Fabric's C++ expects.
const STYLE_PROCESSORS = new Map<string, (value: unknown) => unknown>([
  ['boxShadow', value => processBoxShadow(asBoxShadowInput(value))],
  ['filter', value => processFilter(asFilterInput(value))],
  ['transformOrigin', value => processTransformOrigin(asTransformOriginInput(value))],
  ['transform', processTransformValue],
  ['aspectRatio', value => processAspectRatio(asAspectRatioInput(value))],
  ['fontVariant', value => processFontVariant(asFontVariantInput(value))],
  ['experimental_backgroundImage', value => processBackgroundImage(asBackgroundImageInput(value))],
]);

// boxShadow accepts a CSS string or an array of shadow objects; anything else is
// undefined to processBoxShadow (which returns []). Narrowing avoids an `as` cast.
function asBoxShadowInput(value: unknown): Parameters<typeof processBoxShadow>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// filter accepts a CSS string or an array of single-key filter objects; same narrowing.
function asFilterInput(value: unknown): Parameters<typeof processFilter>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// experimental_backgroundImage accepts a CSS string (gradient functions) or an array of
// structured gradient objects; same narrowing as boxShadow/filter.
function asBackgroundImageInput(value: unknown): Parameters<typeof processBackgroundImage>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// transformOrigin accepts a CSS string or a [x, y, z] array of strings/numbers; anything
// else is undefined to processTransformOrigin (which defaults to center/center/0).
function asTransformOriginInput(value: unknown): Parameters<typeof processTransformOrigin>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isStringOrNumber);
  return undefined;
}

// aspectRatio accepts a number (the common, working form) or a ratio string; otherwise
// undefined, which processAspectRatio drops.
function asAspectRatioInput(value: unknown): Parameters<typeof processAspectRatio>[0] {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

// fontVariant accepts an array of variant strings (the common, working form) or a
// space-separated string; anything else becomes an empty string, which yields [].
function asFontVariantInput(value: unknown): Parameters<typeof processFontVariant>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isString);
  return '';
}

// transform accepts a CSS string (processTransform parses it) or an array of single-key
// transform records (the hot animated / sticky-header path, passed through unchanged).
// A non-string non-array value is NOT dropped: it may already be processed, so it passes
// through verbatim rather than being coerced to [] (which would erase a valid transform).
function processTransformValue(value: unknown): unknown {
  if (typeof value === 'string') return processTransform(value);
  if (Array.isArray(value)) return processTransform(value.filter(isRecord));
  return value;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

// Convert a prop to the shape Fabric's C++ expects. A third-party view contributes
// its own processors, auto-derived from its ViewConfig (validAttributes[*].process,
// e.g. processColor for a slider's track tints); those run first. Then the structured
// CSS-style processors (boxShadow/filter). Built-ins are never in the registry, so they
// fall through to the global color path, where any CSS-string color is run through the
// injected platform processor (Fabric's C++ color parser silently drops strings).
function processValue(component: string, key: string, value: unknown): unknown {
  const processor = registeredProcessor(component, key);
  if (processor !== undefined) return processor(value);
  const styleProcessor = STYLE_PROCESSORS.get(key);
  if (styleProcessor !== undefined) return styleProcessor(value);
  if (COLOR_PROPS.has(key) && isProcessableColor(value)) return processColor(value);
  return value;
}

// Translate the retained node's logical props into the flat payload Fabric's C++
// props expect: `style` keys are hoisted to the top level, event handlers and
// undefined values are dropped.
export function fabricProps(node: ISymbioteNode): IFabricProps {
  if (node.component === RAW_TEXT_COMPONENT) {
    return { text: node.props.text };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'style') continue;
    if (typeof value === 'function') continue;
    if (value === undefined) continue;
    out[key] = processValue(node.component, key, value);
  }
  // Collapse style (object | array | nested arrays) into one flat payload before
  // hoisting: `style={[base, override]}` is RN's idiom and Fabric wants it flat.
  const style = flattenStyle(node.props.style);
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) out[key] = processValue(node.component, key, value);
  }
  return out;
}
