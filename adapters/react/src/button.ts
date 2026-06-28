// Button is the minimal cross-platform button, rendered in its iOS shape per RN's Button.js: a
// TouchableOpacity wrapping a Text. The base text style, the role constant, and the color fold
// (caller color tints the label; disabled greys it) are shared in @symbiote/components/view; here
// React only composes its TouchableOpacity + Text and forwards the native-only props.

import { createElement, type FC } from 'react';
import { Text } from './components';
import { TouchableOpacity } from './touchable';
import { BUTTON_ACCESSIBILITY_ROLE, resolveButtonTextStyle } from '@symbiote/components';
import type { ISymbioteEvent } from '@symbiote/engine';
import type { IAccessibilityProps, IAriaProps } from '@symbiote/components';

export interface IButtonProps extends IAccessibilityProps, IAriaProps {
  title: string;
  onPress?: (event: ISymbioteEvent) => void;
  color?: string;
  disabled?: boolean;
  // Suppress the native tap sound (Button.js:50). Forwarded to the pressable, which owns sound
  // suppression via android_disableSound.
  touchSoundDisabled?: boolean;
  // Locate this button in end-to-end tests (Button.js:144). Forwarded to the root.
  testID?: string;
  // tvOS / Android-TV focus props (Button.js:68,79). Typed and forwarded; inert on a phone host.
  hasTVPreferredFocus?: boolean;
  nextFocusDown?: number;
  nextFocusForward?: number;
  nextFocusLeft?: number;
  nextFocusRight?: number;
  nextFocusUp?: number;
}

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
