// TouchableHighlight underlay: the shared render decision (framework-agnostic). RN drives the
// highlight with setState (not Animated) — while pressed it paints underlayColor + lowers the child
// opacity, at rest it is the bare style (TouchableHighlight.js). This 3-line gating was triplicated
// verbatim across adapters; it lives here once, prop-driven. Each adapter passes its own resolved
// style base (React the raw style, Angular the anchor+style array, Vue the untyped attrs style) plus
// the live `pressed`, so the base is generic — the overlay is layered on top when pressed.

import type { IViewStyle } from '@symbiote-native/engine';

export function highlightPressedStyle<TStyle>(
  pressed: boolean,
  style: TStyle,
  underlayColor: string,
  activeOpacity: number,
): TStyle | [TStyle, IViewStyle] {
  if (!pressed) return style;
  const overlay: IViewStyle = { backgroundColor: underlayColor, opacity: activeOpacity };
  return [style, overlay];
}
