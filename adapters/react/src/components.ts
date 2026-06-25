// Host primitives exposed to user code. They are thin wrappers that produce the
// lowercase host elements the reconciler understands (`view` / `text`); the
// reconciler maps those to shared's mutation API, which resolves them to Fabric
// view names at commit.

import { createElement, type FC, type Ref, type ReactNode } from 'react'
import type { SymbioteEvent } from '@symbiote/engine'
import type { HostInstance } from './host-instance'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { ResponderProps } from './responder-props'
import type { TextStyle, ViewStyle } from './styles'

export interface ViewProps extends AccessibilityProps, AriaProps, ResponderProps {
  style?: ViewStyle
  onPress?: (event: SymbioteEvent) => void
  // Touch lifecycle around a press, synthesized from the touch stream (events.ts),
  // mirroring RN's Pressability — onPressIn fires on touch-down, onPressOut on release.
  onPressIn?: (event: SymbioteEvent) => void
  onPressOut?: (event: SymbioteEvent) => void
  // The most-used View event: fires with the measured frame once Fabric lays the view
  // out. A listener also raises the onLayout flag prop so native actually measures.
  onLayout?: (event: SymbioteEvent) => void
  // Bubbling focus/blur (RN's FocusEventProps) — declared on the base View, so any
  // view emits them; registered in shared's view-config BASE_EVENTS.
  onFocus?: (event: SymbioteEvent) => void
  onBlur?: (event: SymbioteEvent) => void
  // Gate touch handling without changing layout: 'none' lets touches fall through,
  // 'box-none' makes the view itself transparent to touches but not its children.
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  // Enlarge the touch target past the view's visual bounds without affecting layout.
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number }
  testID?: string
  // A stable native handle (focus anchor / native-side lookup), distinct from testID.
  nativeID?: string
  // RN's modern W3C alias for nativeID. Folded into nativeID before commit (id wins
  // when both are set, matching RN's View.js), never sent to Fabric raw.
  id?: string
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
  // Synthesized from a long touch hold by shared/events.ts (a hold timer armed on
  // touch start, fired after 500ms, suppressing the tap on release) — like RN's Text.
  onLongPress?: (event: SymbioteEvent) => void
  // Touch lifecycle around a press (RN's TextProps), synthesized from the touch stream.
  onPressIn?: (event: SymbioteEvent) => void
  onPressOut?: (event: SymbioteEvent) => void
  // The view-frame layout event (RN's TextProps onLayout), distinct from onTextLayout's
  // per-glyph frames; a listener raises the onLayout flag prop so native measures.
  onLayout?: (event: SymbioteEvent) => void
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

// RN's modern `id` is just a W3C-named alias for `nativeID`: View.js copies it over
// (`processedProps.nativeID = id`), so `id` wins when both are set. We fold it here and
// blank the alias so a raw `id` never reaches Fabric (every non-function prop passes
// through to the slot otherwise).
function resolveId({ id, ...rest }: ViewProps): ViewProps {
  if (id === undefined) return rest
  return { ...rest, nativeID: id }
}

export const View: FC<ViewProps> = (props) =>
  createElement('symbiote-view', resolveAccessibilityProps(resolveId(props)))
export const Text: FC<TextProps> = (props) =>
  createElement('symbiote-text', resolveAccessibilityProps(props))
