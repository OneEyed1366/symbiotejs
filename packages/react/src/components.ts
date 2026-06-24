// Host primitives exposed to user code. They are thin wrappers that produce the
// lowercase host elements the reconciler understands (`view` / `text`); the
// reconciler maps those to shared's mutation API, which resolves them to Fabric
// view names at commit.

import { createElement, type FC, type Ref, type ReactNode } from 'react'
import type { SymbioteEvent } from '@symbiote/shared'
import type { HostInstance } from './host-instance'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { TextStyle, ViewStyle } from './styles'

export interface ViewProps extends AccessibilityProps, AriaProps {
  style?: ViewStyle
  onPress?: (event: SymbioteEvent) => void
  // Gate touch handling without changing layout: 'none' lets touches fall through,
  // 'box-none' makes the view itself transparent to touches but not its children.
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  // Enlarge the touch target past the view's visual bounds without affecting layout.
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number }
  testID?: string
  // A stable native handle (focus anchor / native-side lookup), distinct from testID.
  nativeID?: string
  focusable?: boolean
  // Yoga collapses a non-interactive view into its parent unless this is false.
  collapsable?: boolean
  removeClippedSubviews?: boolean
  renderToHardwareTextureAndroid?: boolean
  shouldRasterizeIOS?: boolean
  needsOffscreenAlphaCompositing?: boolean
  // A host ref hands back the public instance (measure / setNativeProps / focus).
  ref?: Ref<HostInstance>
  children?: ReactNode
}

export interface TextProps extends AccessibilityProps, AriaProps {
  style?: TextStyle
  onPress?: (event: SymbioteEvent) => void
  // Synthesized from a long touch hold — NOT yet wired (no `longPress` synthesis in
  // shared/events.ts); declared so call sites type-check. See SHARED CHANGES NEEDED.
  onLongPress?: (event: SymbioteEvent) => void
  // Fires after glyph layout with per-line frames — wired as a direct event (RCTText).
  onTextLayout?: (event: SymbioteEvent) => void
  numberOfLines?: number
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip'
  selectable?: boolean
  adjustsFontSizeToFit?: boolean
  minimumFontScale?: number
  allowFontScaling?: boolean
  maxFontSizeMultiplier?: number | null
  // A color prop — the shared commit layer already runs `selectionColor` through the
  // platform color processor (commit.ts COLOR_PROPS), so it reaches Fabric correctly.
  selectionColor?: string
  testID?: string
  nativeID?: string
  ref?: Ref<HostInstance>
  children?: ReactNode
}

export const View: FC<ViewProps> = (props) =>
  createElement('symbiote-view', resolveAccessibilityProps(props))
export const Text: FC<TextProps> = (props) =>
  createElement('symbiote-text', resolveAccessibilityProps(props))
