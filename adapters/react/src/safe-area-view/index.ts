// SafeAreaView primitive. A plain view whose native side insets its children to
// the safe area (notch, rounded corners, system bars). There is no JS-side
// translation; RN just renders the native RCTSafeAreaView and lets the host do
// the inset math, so this maps style + children straight onto the intrinsic.

import { createElement, type FC, type ReactNode } from 'react';
import { dlog, type ISymbioteEvent } from '@symbiote/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';

export interface ISafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  children?: ReactNode;
  onLayout?: (event: ISymbioteEvent) => void;
}

export const SafeAreaView: FC<ISafeAreaViewProps> = rawProps => {
  // Owns its host element (symbiote-safe-area-view), so it folds aria/role here;
  // the resolved accessibility* surface rides the node via `...accessibilityRest`.
  const props = resolveAccessibilityProps(rawProps);
  const { style, children, onLayout, ...accessibilityRest } = props;

  dlog('SafeAreaView -> SafeAreaView');

  const nodeProps: Record<string, unknown> = { ...accessibilityRest, style };
  if (onLayout !== undefined) nodeProps.onLayout = onLayout;

  return createElement('symbiote-safe-area-view', nodeProps, children);
};
