// ActivityIndicator is the React lifecycle half. The render (size translation, wrapper +
// spinner, color omission) lives framework-agnostic in @symbiote/components; here the
// adapter only resolves props (accessibility, defaults), calls the render fn, and bridges
// the Descriptor to a React element. No state, no effects: this component is render-only.
//
// The per-platform bits (iOS GRAY default + no extras; Android theme/null + styleAttr +
// indeterminate) are supplied by the .ios/.android files via `IActivityIndicatorPlatform`.

import type { FC } from 'react';
import { renderActivityIndicator } from '@symbiote/components';
import type { IActivityIndicatorPlatform, IActivityIndicatorSize } from '@symbiote/components';
import type { ISymbioteEvent } from '@symbiote/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote/components';
import { descriptorToReact } from '../descriptor-to-react';
import type { IStyleProp, IViewStyle } from '../styles';

export type { IActivityIndicatorPlatform } from '@symbiote/components';

export interface IActivityIndicatorProps extends IAccessibilityProps, IAriaProps {
  animating?: boolean;
  color?: string;
  size?: IActivityIndicatorSize;
  hidesWhenStopped?: boolean;
  style?: IStyleProp<IViewStyle>;
  // testID / nativeID / accessibility surface are inherited. RN spreads `...props` onto
  // the centering wrapper View, so they land on the wrapper, not the spinner.
  onLayout?: (event: ISymbioteEvent) => void;
}

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
