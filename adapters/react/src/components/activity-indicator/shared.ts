// ActivityIndicator is the React lifecycle half. The render (size translation, wrapper +
// spinner, color omission) lives framework-agnostic in @symbiote-native/components; here the
// adapter only resolves props (accessibility, defaults), calls the render fn, and bridges
// the Descriptor to a React element. No state, no effects: this component is render-only.
//
// The per-platform bits (iOS GRAY default + no extras; Android theme/null + styleAttr +
// indeterminate) are supplied by the .ios/.android files via `IActivityIndicatorPlatform`.
//
// useActivityIndicatorLogic is a plain top-level hook, not a component factory returning a
// closure: React Compiler's component/hook detection only walks top-level declarations, so
// index.ios.ts / index.android.ts each declare their OWN top-level `ActivityIndicator`
// function that calls this hook, rather than exporting whatever a factory here returns (same
// shape as switch/shared.ts's useSwitchLogic).

import { renderActivityIndicator, resolveAccessibilityProps } from '@symbiote-native/components';
import type {
  IActivityIndicatorPlatform,
  IActivityIndicatorProps as IActivityIndicatorBaseProps,
} from '@symbiote-native/components';

// IActivityIndicatorPlatform is framework-agnostic (no ref / children), so it lives in
// @symbiote-native/components and every adapter re-exports it verbatim; the React adapter supplies only
// the lifecycle (render-only here) + the descriptor bridge.
export type { IActivityIndicatorPlatform } from '@symbiote-native/components';

// className is React's own field, not part of the shared agnostic prop type; not destructured
// below, so it falls into `...passthrough` and lands on the centering wrapper View, like `style`.
export type IActivityIndicatorProps = IActivityIndicatorBaseProps & { className?: string };

export function useActivityIndicatorLogic(
  rawProps: IActivityIndicatorProps,
  platform: IActivityIndicatorPlatform,
) {
  // The wrapper is a raw symbiote-view, not the View FC, so it never runs
  // resolveAccessibilityProps itself, so fold aria/role here, then forward the resolved
  // accessibility* surface (plus testID / onLayout) onto the wrapper via `passthrough`.
  const props = resolveAccessibilityProps(rawProps);
  const {
    animating = true,
    color,
    hidesWhenStopped = true,
    size = 'small',
    style,
    ...passthrough
  } = props;

  return renderActivityIndicator(
    { animating, color, hidesWhenStopped, size, style, passthrough },
    platform,
  );
}
