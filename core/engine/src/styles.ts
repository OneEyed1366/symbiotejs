// The typed style surface (ViewStyle / TextStyle and friends). Maps onto Yoga layout
// props and RN's view/text props, which Fabric's C++ reads off the props payload.
// A correctly-typed subset of RN's StyleSheet surface (see
// react-native/Libraries/StyleSheet/StyleSheetTypes): the load-bearing layout / box /
// shadow / transform / text props, not the full surface. Agnostic types, so they
// live in the engine next to the style processors; every adapter re-exports them.

import type { IColorValue } from './platform-color';

// RN allows `%` strings for layout dimensions and insets, plus the 'auto' keyword.
export type IDimensionValue = number | string;

export type IFlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
export type IFlexJustify =
  'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';

// transform is an array of single-key objects, applied in order. Each entry names
// exactly one transform; numeric ones take a number, angular/skew ones a string.
export type ITransformProp =
  | { translateX: number }
  | { translateY: number }
  | { scale: number }
  | { scaleX: number }
  | { scaleY: number }
  | { rotate: string }
  | { rotateX: string }
  | { rotateY: string }
  | { rotateZ: string }
  | { skewX: string }
  | { skewY: string }
  | { perspective: number }
  // A pre-baked 4x4 column-major affine matrix (16 numbers) or 3x3 (9). Fabric
  // consumes it as-is: flattenStyle copies the array through untouched, no parse.
  | { matrix: number[] };

// New-Architecture box shadow (StyleSheetTypes BoxShadowValue:816). Either a CSS
// `box-shadow` string or an array of shadow objects; Fabric's C++ parses both, so
// these reach native as raw style props (no JS-side processColor on the nested color).
export interface IBoxShadowValue {
  offsetX: number | string;
  offsetY: number | string;
  color?: IColorValue;
  blurRadius?: number | string;
  spreadDistance?: number | string;
  inset?: boolean;
}

// `filter`'s drop-shadow primitive (StyleSheetTypes DropShadowValue:721).
export interface IDropShadowValue {
  offsetX: number | string;
  offsetY: number | string;
  standardDeviation?: number | string;
  color?: IColorValue;
}

// One CSS filter function (StyleSheetTypes FilterFunction:709): each entry names
// exactly one filter, mirroring the single-key-object shape of TransformProp.
export type IFilterFunction =
  | { brightness: number | string }
  | { blur: number | string }
  | { contrast: number | string }
  | { grayscale: number | string }
  | { hueRotate: number | string }
  | { invert: number | string }
  | { opacity: number | string }
  | { saturate: number | string }
  | { sepia: number | string }
  | { dropShadow: IDropShadowValue | string };

// One gradient color stop (StyleSheetTypes BackgroundImageValue:728/768): a color plus zero or
// more positions — two positions on one stop is CSS's "double position" shorthand for two
// adjacent stops sharing a color (expanded by the processor, not here).
export type IColorStopValue = {
  color: IColorValue;
  positions?: ReadonlyArray<string>;
};

// Linear gradient (StyleSheetTypes LinearGradientValue:728). `direction` is a raw CSS angle
// (`'45deg'`) or keyword (`'to right'`); RN defaults to `'to bottom'` (180deg) when omitted.
export type ILinearGradientValue = {
  type: 'linear-gradient';
  direction?: string;
  colorStops: ReadonlyArray<IColorStopValue>;
};

// Radial gradient position (StyleSheetTypes RadialGradientPosition:743) — always exactly one
// vertical + one horizontal edge, never all four (mirrors CSS `at <position>` syntax).
export type IRadialGradientPosition =
  | { top: number | string; left: number | string }
  | { top: number | string; right: number | string }
  | { bottom: number | string; left: number | string }
  | { bottom: number | string; right: number | string };

export type IRadialGradientShape = 'circle' | 'ellipse';
export type IRadialGradientSize =
  | 'closest-corner'
  | 'closest-side'
  | 'farthest-corner'
  | 'farthest-side'
  | { x: string | number; y: string | number };

// Radial gradient (StyleSheetTypes RadialGradientValue:764).
export type IRadialGradientValue = {
  type: 'radial-gradient';
  shape?: IRadialGradientShape;
  size?: IRadialGradientSize;
  position?: IRadialGradientPosition;
  colorStops: ReadonlyArray<IColorStopValue>;
};

// `background-image` / gradients (StyleSheetTypes BackgroundImageValue:775). Same New-
// Architecture shape as `boxShadow`/`filter` above: a CSS string or a structured array, JS-
// parsed before native because `enableNativeCSSParsing()` defaults to `false` — see
// `core/engine/src/process-background-image`.
export type IBackgroundImageValue = ILinearGradientValue | IRadialGradientValue;

// CSS mix-blend-mode keywords (StyleSheetTypes ____BlendMode_Internal:825).
export type IBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-lighter';

export interface IViewStyle {
  // Box dimensions
  width?: IDimensionValue;
  height?: IDimensionValue;
  minWidth?: IDimensionValue;
  minHeight?: IDimensionValue;
  maxWidth?: IDimensionValue;
  maxHeight?: IDimensionValue;
  aspectRatio?: number | string;

  // Flexbox
  flex?: number;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  flexBasis?: IDimensionValue;
  flexGrow?: number;
  flexShrink?: number;
  alignItems?: IFlexAlign;
  alignSelf?: 'auto' | IFlexAlign;
  alignContent?: IFlexJustify | 'stretch';
  justifyContent?: IFlexJustify;
  // Yoga layout direction. 'inherit' takes the parent's; ltr/rtl force it.
  direction?: 'inherit' | 'ltr' | 'rtl';
  gap?: number | string;
  rowGap?: number | string;
  columnGap?: number | string;

  // Positioning
  position?: 'absolute' | 'relative' | 'static';
  top?: IDimensionValue;
  right?: IDimensionValue;
  bottom?: IDimensionValue;
  left?: IDimensionValue;
  start?: IDimensionValue;
  end?: IDimensionValue;
  zIndex?: number;

  // Padding (shorthand + per-edge)
  padding?: IDimensionValue;
  paddingHorizontal?: IDimensionValue;
  paddingVertical?: IDimensionValue;
  paddingTop?: IDimensionValue;
  paddingRight?: IDimensionValue;
  paddingBottom?: IDimensionValue;
  paddingLeft?: IDimensionValue;
  paddingStart?: IDimensionValue;
  paddingEnd?: IDimensionValue;

  // Margin (shorthand + per-edge)
  margin?: IDimensionValue;
  marginHorizontal?: IDimensionValue;
  marginVertical?: IDimensionValue;
  marginTop?: IDimensionValue;
  marginRight?: IDimensionValue;
  marginBottom?: IDimensionValue;
  marginLeft?: IDimensionValue;
  marginStart?: IDimensionValue;
  marginEnd?: IDimensionValue;

  // Borders: radius per corner
  borderRadius?: number | string;
  borderTopLeftRadius?: number | string;
  borderTopRightRadius?: number | string;
  borderBottomLeftRadius?: number | string;
  borderBottomRightRadius?: number | string;
  // Logical (writing-direction-relative) corner radii: resolve to physical
  // corners per `direction`. RTL flips start/end.
  borderStartStartRadius?: number | string;
  borderStartEndRadius?: number | string;
  borderEndStartRadius?: number | string;
  borderEndEndRadius?: number | string;
  // iOS 13+ continuous ("squircle") vs circular corner contour.
  borderCurve?: 'circular' | 'continuous';

  // Borders: width per edge
  borderWidth?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderStartWidth?: number;
  borderEndWidth?: number;

  // Borders: color per edge
  borderColor?: IColorValue;
  borderTopColor?: IColorValue;
  borderRightColor?: IColorValue;
  borderBottomColor?: IColorValue;
  borderLeftColor?: IColorValue;
  borderStartColor?: IColorValue;
  borderEndColor?: IColorValue;
  borderStyle?: 'solid' | 'dotted' | 'dashed';

  // Visual
  backgroundColor?: IColorValue;
  opacity?: number;
  overflow?: 'visible' | 'hidden' | 'scroll';
  display?: 'none' | 'flex';
  backfaceVisibility?: 'visible' | 'hidden';

  // Shadow (iOS) + elevation (Android)
  shadowColor?: IColorValue;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;

  // Transform
  transform?: ITransformProp[];
  // The point a transform scales/rotates about (StyleSheetTypes:94 in _TransformStyle).
  // CSS string (`'30% 80% 15px'`) or a [x, y, z] tuple; the z element must be a number.
  transformOrigin?: [string | number, string | number, string | number] | string;

  // New-Architecture visual props (StyleSheetTypes ____ViewStyle_InternalBase:887).
  // All three are pass-through style keys: flattenStyle copies the array/object/string
  // value untouched and fabricProps hoists it, so Fabric's C++ does the parsing: no
  // ViewConfig validAttributes entry and no JS-side color processing are needed.
  boxShadow?: IBoxShadowValue[] | string;
  filter?: IFilterFunction[] | string;
  experimental_backgroundImage?: IBackgroundImageValue[] | string;
  mixBlendMode?: IBlendMode;
}

export interface ITextStyle extends IViewStyle {
  color?: IColorValue;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: 'normal' | 'italic';
  fontWeight?:
    'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  letterSpacing?: number;
  lineHeight?: number;
  textAlign?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
  textTransform?: 'none' | 'capitalize' | 'uppercase' | 'lowercase';
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  // A color prop: needs processColor before Fabric. See SHARED CHANGES NEEDED:
  // the type is declared here, the COLOR_PROPS wiring is a shared change.
  textDecorationColor?: IColorValue;
  textDecorationStyle?: 'solid' | 'double' | 'dotted' | 'dashed';
  // OpenType feature selectors, e.g. ['tabular-nums', 'oldstyle-nums'].
  fontVariant?: string[];
  // Per-text override of the layout writing direction.
  writingDirection?: 'auto' | 'ltr' | 'rtl';
  includeFontPadding?: boolean;
}

// A style "slot" exactly as RN callers pass it: a single style object, a (possibly
// nested) array of them, or a falsy entry that contributes nothing, the idiom
// `style={[base, cond && override]}`. Mirrors RN's StyleProp<T> (StyleSheetTypes:
// RecursiveArray + Falsy). The engine's flattenStyle collapses the whole shape to one
// flat payload at commit (style.ts), so every public `style` prop accepts this, not a
// bare object. We omit RN's RegisteredStyle brand: our StyleSheet.create is identity
// (returns the objects, not opaque numeric ids), so there is no id to model.
type IStyleFalsy = false | null | undefined | '';
type IRecursiveArray<T> = ReadonlyArray<T | IRecursiveArray<T>>;
export type IStyleProp<T> = T | IStyleFalsy | IRecursiveArray<T | IStyleFalsy>;

// The constraint behind StyleSheet.create. Mirrors RN's NamedStyles<T>
// (StyleSheet.d.ts:26): it both validates each entry as a real style object AND
// supplies the contextual type that keeps string-literal props (flexDirection: 'row')
// from widening to `string`: the exact guarantee a bare identity create loses.
export type INamedStyles<T> = { [P in keyof T]: IViewStyle | ITextStyle };
