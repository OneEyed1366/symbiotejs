// ActivityIndicator — shared core. RN wraps the native spinner in a centering View and
// translates `size` in JS: 'small'/'large' map to a native size enum AND a fixed box
// style; a numeric size never reaches native (it sizes the spinner via style only).
// That translation is platform-invariant and lives here.
//
// What IS platform-specific (ADR 0020, prop-level): Android's AndroidProgressBar needs
// `styleAttr` (which triggers its setStyle() — without it the view throws "setStyle()
// not called") plus `indeterminate: true`, and its default color is the theme (null),
// whereas iOS's ActivityIndicatorView takes neither and defaults to GRAY. So the factory
// takes those platform bits and the .ios/.android files supply them; the filename
// selects, no Platform.OS read.

import { createElement, type FC } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { ViewStyle } from './styles'

type ActivityIndicatorSize = 'small' | 'large' | number

// Fixed pixel boxes RN gives the two named sizes (styles.sizeSmall/sizeLarge).
const SIZE_SMALL_PX = 20
const SIZE_LARGE_PX = 36

// Centering wrapper RN puts around the spinner (styles.container).
const CONTAINER_STYLE: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
}

export interface ActivityIndicatorProps {
  animating?: boolean
  color?: string
  size?: ActivityIndicatorSize
  hidesWhenStopped?: boolean
  style?: ViewStyle
  // Standard ViewProps. RN spreads `...props` onto the centering wrapper View, so
  // these land on the wrapper, not the spinner.
  testID?: string
  accessibilityLabel?: string
  accessible?: boolean
  onLayout?: (event: SymbioteEvent) => void
}

// The per-platform pieces the factory needs: the default spinner color (iOS GRAY vs
// Android theme/null) and any extra native props the platform's spinner requires
// (Android's styleAttr + indeterminate; none on iOS).
export interface ActivityIndicatorPlatform {
  defaultColor: string | null
  nativeExtras: Readonly<Record<string, unknown>>
}

interface NativeSize {
  sizeStyle: ViewStyle
  sizeProp?: 'small' | 'large'
}

function resolveSize(size: ActivityIndicatorSize): NativeSize {
  if (size === 'small') {
    return { sizeStyle: { width: SIZE_SMALL_PX, height: SIZE_SMALL_PX }, sizeProp: 'small' }
  }
  if (size === 'large') {
    return { sizeStyle: { width: SIZE_LARGE_PX, height: SIZE_LARGE_PX }, sizeProp: 'large' }
  }
  return { sizeStyle: { width: size, height: size } }
}

export function createActivityIndicator(
  platform: ActivityIndicatorPlatform,
): FC<ActivityIndicatorProps> {
  return (props) => {
    const {
      animating = true,
      color,
      hidesWhenStopped = true,
      size = 'small',
      style,
      testID,
      accessibilityLabel,
      accessible,
      onLayout,
    } = props

    const { sizeStyle, sizeProp } = resolveSize(size)
    dlog(
      sizeProp !== undefined
        ? `ActivityIndicator size '${sizeProp}' -> native size enum '${sizeProp}'`
        : `ActivityIndicator size ${String(size)} -> style only, native size not set`,
    )

    const nativeProps: Record<string, unknown> = {
      animating,
      hidesWhenStopped,
      style: sizeStyle,
      ...platform.nativeExtras,
    }
    // Omit color entirely when neither given nor defaulted (Android's theme default is
    // null) — a null color prop would be rejected by Fabric's color parser.
    const resolvedColor = color ?? platform.defaultColor
    if (resolvedColor !== null) nativeProps.color = resolvedColor
    if (sizeProp !== undefined) nativeProps.size = sizeProp

    dlog('ActivityIndicator -> RCTView(spinner)')

    const wrapperProps: Record<string, unknown> = { style: { ...CONTAINER_STYLE, ...style } }
    if (testID !== undefined) wrapperProps.testID = testID
    if (accessibilityLabel !== undefined) wrapperProps.accessibilityLabel = accessibilityLabel
    if (accessible !== undefined) wrapperProps.accessible = accessible
    if (onLayout !== undefined) wrapperProps.onLayout = onLayout

    return createElement(
      'symbiote-view',
      wrapperProps,
      createElement('symbiote-activity-indicator', nativeProps),
    )
  }
}
