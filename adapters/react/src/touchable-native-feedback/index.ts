// TouchableNativeFeedback: Android's ripple/state-drawable touchable, built on Pressable like the
// rest of the family. RN realizes its feedback by cloning the child into an RCTView carrying native
// ripple props; we instead nest the child under a feedback View that carries those props, inside a
// Pressable that owns the press wiring. The native props (nativeBackgroundAndroid /
// nativeForegroundAndroid) are read by Android's ReactViewManager; on iOS they are inert props, so
// the component still renders its child with working press wiring. The static factories +
// background mapping are shared in @symbiote/components/view. React only attaches them onto the
// component value and nests the feedback View.

import { createElement, type FC, type ReactNode } from 'react';
import { dlog } from '@symbiote/engine';
import {
  backgroundProps,
  canUseNativeForeground,
  rippleBackground,
  selectableBackground,
  selectableBackgroundBorderless,
  type INativeFeedbackBackground,
  type IThemeAttrBackground,
  type IRippleBackground,
} from '@symbiote/components';
import { View } from '../components';
import { Pressable, type IPressableProps } from '../pressable';

export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote/components';

type ITouchableNativeFeedbackBaseProps = Omit<IPressableProps, 'style' | 'children'> & {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
  // A single child element, mirroring RN (it accepts only one View child).
  children?: ReactNode;
};

export type ITouchableNativeFeedbackProps = ITouchableNativeFeedbackBaseProps;

// The static helpers are pure: each returns the plain config dict RN's native ripple manager
// understands. They live as properties on the component value so callers reach them as
// `TouchableNativeFeedback.Ripple(...)`, exactly like RN.
interface ITouchableNativeFeedbackComponent extends FC<ITouchableNativeFeedbackProps> {
  SelectableBackground: (rippleRadius?: number) => IThemeAttrBackground;
  SelectableBackgroundBorderless: (rippleRadius?: number) => IThemeAttrBackground;
  Ripple: (color: string, borderless: boolean, rippleRadius?: number) => IRippleBackground;
  canUseNativeForeground: () => boolean;
}

const TouchableNativeFeedbackImpl: FC<ITouchableNativeFeedbackProps> = props => {
  const { background, useForeground = false, children, ...rest } = props;

  // RN defaults a missing background to SelectableBackground() so the touchable always has
  // feedback; mirror that here.
  const resolved = background ?? selectableBackground();
  dlog(`TouchableNativeFeedback render ${resolved.type} useForeground ${useForeground}`);

  const nativeProps = backgroundProps(resolved, useForeground);
  // The native ripple props ride a dedicated feedback View nested under the Pressable; the
  // Pressable owns the press wiring, the feedback View owns the drawable.
  const feedback = createElement(View, nativeProps, children);
  return createElement(Pressable, rest, feedback);
};

const TouchableNativeFeedback: ITouchableNativeFeedbackComponent = Object.assign(
  TouchableNativeFeedbackImpl,
  {
    SelectableBackground: selectableBackground,
    SelectableBackgroundBorderless: selectableBackgroundBorderless,
    Ripple: rippleBackground,
    canUseNativeForeground,
  },
);

export { TouchableNativeFeedback };
