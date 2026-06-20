// A typed style surface for the View + Text canary. These map onto Yoga layout
// props and RN's view/text props, which Fabric's C++ reads off the props payload.
// A broad, correctly-typed subset of RN's StyleSheet surface — see
// react-native/Libraries/StyleSheet/StyleSheetTypes — not the full thing, but the
// load-bearing layout / box / shadow / transform / text props.

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

  // Borders — width per edge
  borderWidth?: number
  borderTopWidth?: number
  borderRightWidth?: number
  borderBottomWidth?: number
  borderLeftWidth?: number
  borderStartWidth?: number
  borderEndWidth?: number

  // Borders — color per edge
  borderColor?: string
  borderTopColor?: string
  borderRightColor?: string
  borderBottomColor?: string
  borderLeftColor?: string
  borderStartColor?: string
  borderEndColor?: string
  borderStyle?: 'solid' | 'dotted' | 'dashed'

  // Visual
  backgroundColor?: string
  opacity?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  display?: 'none' | 'flex'
  backfaceVisibility?: 'visible' | 'hidden'

  // Shadow (iOS) + elevation (Android)
  shadowColor?: string
  shadowOffset?: { width: number; height: number }
  shadowOpacity?: number
  shadowRadius?: number
  elevation?: number

  // Transform
  transform?: TransformProp[]
}

export interface TextStyle extends ViewStyle {
  color?: string
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
  includeFontPadding?: boolean
}
