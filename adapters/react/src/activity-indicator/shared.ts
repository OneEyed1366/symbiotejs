// ActivityIndicator is the React lifecycle half. The render (size translation, wrapper +
// spinner, color omission) lives framework-agnostic in @symbiote/components; here the
// adapter only resolves props (accessibility, defaults), calls the render fn, and bridges
// the Descriptor to a React element. No state, no effects: this component is render-only.
//
// The per-platform bits (iOS GRAY default + no extras; Android theme/null + styleAttr +
// indeterminate) are supplied by the .ios/.android files via `IActivityIndicatorPlatform`.

import type { FC } from 'react';
import { renderActivityIndicator, resolveAccessibilityProps } from '@symbiote/components';
import type { IActivityIndicatorPlatform, IActivityIndicatorProps } from '@symbiote/components';
import { descriptorToReact } from '../descriptor-to-react';

// IActivityIndicatorProps is framework-agnostic (no ref / children), so it lives in
// @symbiote/components and every adapter re-exports it; the React adapter supplies only the
// lifecycle (render-only here) + the descriptor bridge.
export type { IActivityIndicatorPlatform, IActivityIndicatorProps } from '@symbiote/components';

export function createActivityIndicator(
  platform: IActivityIndicatorPlatform,
): FC<IActivityIndicatorProps> {
  return rawProps => {
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

    const descriptor = renderActivityIndicator(
      { animating, color, hidesWhenStopped, size, style, passthrough },
      platform,
    );
    return descriptorToReact(descriptor);
  };
}
