// Button is the minimal cross-platform button, rendered in its iOS shape per RN's Button.js: a
// TouchableOpacity wrapping a Text. The base text style, the role constant, and the color fold
// (caller color tints the label; disabled greys it) are shared in @symbiote/components/view; here
// React only composes its TouchableOpacity + Text and forwards the native-only props.

import { createElement, type FC } from 'react';
import { Text } from './components';
import { TouchableOpacity } from './touchable';
import { BUTTON_ACCESSIBILITY_ROLE, resolveButtonTextStyle } from '@symbiote/components';
import type { IButtonProps } from '@symbiote/components';

// IButtonProps is framework-agnostic (it takes a `title` string, no children / ref), so it lives
// in @symbiote/components and every adapter re-exports it; React only composes TouchableOpacity + Text.
export type { IButtonProps } from '@symbiote/components';

export const Button: FC<IButtonProps> = props => {
  const {
    title,
    onPress,
    color,
    disabled,
    touchSoundDisabled,
    testID,
    hasTVPreferredFocus,
    nextFocusDown,
    nextFocusForward,
    nextFocusLeft,
    nextFocusRight,
    nextFocusUp,
    ...accessibilityRest
  } = props;

  const textStyle = resolveButtonTextStyle(color, disabled);

  // The pressable / native View props TouchableOpacity does not type but forwards to Fabric
  // (testID + TV-focus). Carried as a plain record (the pass-through idiom Image uses) so
  // excess-property typing does not reject the native-only keys. TV-focus is inert on a phone.
  const nativeForward: Record<string, unknown> = { testID };
  if (hasTVPreferredFocus !== undefined) nativeForward.hasTVPreferredFocus = hasTVPreferredFocus;
  if (nextFocusDown !== undefined) nativeForward.nextFocusDown = nextFocusDown;
  if (nextFocusForward !== undefined) nativeForward.nextFocusForward = nextFocusForward;
  if (nextFocusLeft !== undefined) nativeForward.nextFocusLeft = nextFocusLeft;
  if (nextFocusRight !== undefined) nativeForward.nextFocusRight = nextFocusRight;
  if (nextFocusUp !== undefined) nativeForward.nextFocusUp = nextFocusUp;

  // RN's Button sets role=button, is accessible, and propagates the disabled accessibility state.
  // The caller's accessibility props pass through, but Button's fixed role / accessible /
  // disabled-state win, applied after the spread. touchSoundDisabled maps to the pressable's
  // android_disableSound.
  return createElement(
    TouchableOpacity,
    {
      ...accessibilityRest,
      ...nativeForward,
      onPress,
      disabled,
      android_disableSound: touchSoundDisabled,
      accessibilityRole: BUTTON_ACCESSIBILITY_ROLE,
      accessible: true,
      accessibilityState: { disabled },
    },
    createElement(Text, { style: textStyle }, title),
  );
};
