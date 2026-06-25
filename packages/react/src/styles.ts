// A typed style surface for the View + Text canary. These map onto Yoga layout
// props and RN's view/text props, which Fabric's C++ reads off the props payload.
// A broad, correctly-typed subset of RN's StyleSheet surface — see
// react-native/Libraries/StyleSheet/StyleSheetTypes — not the full thing, but the
// load-bearing layout / box / shadow / transform / text props.

import type { ColorValue } from '@symbiote/shared'

// RN allows `%` strings for layout dimensions and insets, plus the 'auto' keyword.
export type DimensionValue = number | string

export type FlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
export type FlexJustify =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'

// transform is an array of single-key objects, applied in order. Each entry names
// exactly one transform; numeric ones take a number, angular/skew ones a string.
export type TransformProp =
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
  // consumes it as-is — flattenStyle copies the array through untouched, no parse.
  | { matrix: number[] }

// New-Architecture box shadow (StyleSheetTypes BoxShadowValue:816). Either a CSS
// `box-shadow` string or an array of shadow objects; Fabric's C++ parses both, so
// these reach native as raw style props (no JS-side processColor on the nested color).
export interface BoxShadowValue {
  offsetX: number | string
  offsetY: number | string
  color?: ColorValue
  blurRadius?: number | string
  spreadDistance?: number | string
  inset?: boolean
}

// `filter`'s drop-shadow primitive (StyleSheetTypes DropShadowValue:721).
export interface DropShadowValue {
  offsetX: number | string
  offsetY: number | string
  standardDeviation?: number | string
  color?: ColorValue
}

// One CSS filter function (StyleSheetTypes FilterFunction:709) — each entry names
// exactly one filter, mirroring the single-key-object shape of TransformProp.
export type FilterFunction =
  | { brightness: number | string }
  | { blur: number | string }
  | { contrast: number | string }
  | { grayscale: number | string }
  | { hueRotate: number | string }
  | { invert: number | string }
  | { opacity: number | string }
  | { saturate: number | string }
  | { sepia: number | string }
  | { dropShadow: DropShadowValue | string }

// CSS mix-blend-mode keywords (StyleSheetTypes ____BlendMode_Internal:825).
export type BlendMode =
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
  | 'plus-lighter'

export interface ViewStyle {
  // Box dimensions
  width?: DimensionValue
  height?: DimensionValue
  minWidth?: DimensionValue
  minHeight?: DimensionValue
  maxWidth?: DimensionValue
  maxHeight?: DimensionValue
  aspectRatio?: number | string

  // Flexbox
  flex?: number
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse'
  flexBasis?: DimensionValue
  flexGrow?: number
  flexShrink?: number
  alignItems?: FlexAlign
  alignSelf?: 'auto' | FlexAlign
  alignContent?: FlexJustify | 'stretch'
  justifyContent?: FlexJustify
  // Yoga layout direction. 'inherit' takes the parent's; ltr/rtl force it.
  direction?: 'inherit' | 'ltr' | 'rtl'
  gap?: number | string
  rowGap?: number | string
  columnGap?: number | string

  // Positioning
  position?: 'absolute' | 'relative' | 'static'
  top?: DimensionValue
  right?: DimensionValue
  bottom?: DimensionValue
  left?: DimensionValue
  start?: DimensionValue
  end?: DimensionValue
  zIndex?: number

  // Padding (shorthand + per-edge)
  padding?: DimensionValue
  paddingHorizontal?: DimensionValue
  paddingVertical?: DimensionValue
  paddingTop?: DimensionValue
  paddingRight?: DimensionValue
  paddingBottom?: DimensionValue
  paddingLeft?: DimensionValue
  paddingStart?: DimensionValue
  paddingEnd?: DimensionValue

  // Margin (shorthand + per-edge)
  margin?: DimensionValue
  marginHorizontal?: DimensionValue
  marginVertical?: DimensionValue
  marginTop?: DimensionValue
  marginRight?: DimensionValue
  marginBottom?: DimensionValue
  marginLeft?: DimensionValue
  marginStart?: DimensionValue
  marginEnd?: DimensionValue

  // Borders — radius per corner
  borderRadius?: number | string
  borderTopLeftRadius?: number | string
  borderTopRightRadius?: number | string
  borderBottomLeftRadius?: number | string
  borderBottomRightRadius?: number | string
  // Logical (writing-direction-relative) corner radii — resolve to physical
  // corners per `direction`. RTL flips start/end.
  borderStartStartRadius?: number | string
  borderStartEndRadius?: number | string
  borderEndStartRadius?: number | string
  borderEndEndRadius?: number | string
  // iOS 13+ continuous ("squircle") vs circular corner contour.
  borderCurve?: 'circular' | 'continuous'

  // Borders — width per edge
  borderWidth?: number
  borderTopWidth?: number
  borderRightWidth?: number
  borderBottomWidth?: number
  borderLeftWidth?: number
  borderStartWidth?: number
  borderEndWidth?: number

  // Borders — color per edge
  borderColor?: ColorValue
  borderTopColor?: ColorValue
  borderRightColor?: ColorValue
  borderBottomColor?: ColorValue
  borderLeftColor?: ColorValue
  borderStartColor?: ColorValue
  borderEndColor?: ColorValue
  borderStyle?: 'solid' | 'dotted' | 'dashed'

  // Visual
  backgroundColor?: ColorValue
  opacity?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  display?: 'none' | 'flex'
  backfaceVisibility?: 'visible' | 'hidden'

  // Shadow (iOS) + elevation (Android)
  shadowColor?: ColorValue
  shadowOffset?: { width: number; height: number }
  shadowOpacity?: number
  shadowRadius?: number
  elevation?: number

  // Transform
  transform?: TransformProp[]
  // The point a transform scales/rotates about (StyleSheetTypes:94 in _TransformStyle).
  // CSS string (`'30% 80% 15px'`) or a [x, y, z] tuple; the z element must be a number.
  transformOrigin?: [string | number, string | number, string | number] | string

  // New-Architecture visual props (StyleSheetTypes ____ViewStyle_InternalBase:887).
  // All three are pass-through style keys: flattenStyle copies the array/object/string
  // value untouched and fabricProps hoists it, so Fabric's C++ does the parsing — no
  // ViewConfig validAttributes entry and no JS-side color processing are needed.
  boxShadow?: BoxShadowValue[] | string
  filter?: FilterFunction[] | string
  mixBlendMode?: BlendMode
}

export interface TextStyle extends ViewStyle {
  color?: ColorValue
  fontFamily?: string
  fontSize?: number
  fontStyle?: 'normal' | 'italic'
  fontWeight?:
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900'
  letterSpacing?: number
  lineHeight?: number
  textAlign?: 'auto' | 'left' | 'right' | 'center' | 'justify'
  textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center'
  textTransform?: 'none' | 'capitalize' | 'uppercase' | 'lowercase'
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through'
  // A color prop: needs processColor before Fabric. See SHARED CHANGES NEEDED —
  // the type is declared here, the COLOR_PROPS wiring is a shared change.
  textDecorationColor?: ColorValue
  textDecorationStyle?: 'solid' | 'double' | 'dotted' | 'dashed'
  // OpenType feature selectors, e.g. ['tabular-nums', 'oldstyle-nums'].
  fontVariant?: string[]
  // Per-text override of the layout writing direction.
  writingDirection?: 'auto' | 'ltr' | 'rtl'
  includeFontPadding?: boolean
}
