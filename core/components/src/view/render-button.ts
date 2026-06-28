// Button: the shared render half (framework-agnostic). Rendered in RN's iOS shape (Button.js): a
// TouchableOpacity wrapping a Text. The pure pieces: the base text style, the role constant, and
// the color fold (caller color tints the label; disabled greys it) live here so every adapter
// paints the identical button. The adapter only composes its TouchableOpacity + Text around them.

import type { ITextStyle } from '@symbiote/engine';

const IOS_BUTTON_BLUE = '#007AFF';
const IOS_DISABLED_GREY = '#cdcdcd';

// RN's Button is accessibilityRole="button"; the role string is a native accessibility enum value.
export const BUTTON_ACCESSIBILITY_ROLE = 'button';

export const buttonTextStyle: ITextStyle = {
  color: IOS_BUTTON_BLUE,
  textAlign: 'center',
  padding: 8,
  fontSize: 18,
};

// The label text style with the color folded in: an explicit `color` tints the label (iOS), and
// `disabled` greys it out (disabled wins over color, matching RN's Button.js).
export function resolveButtonTextStyle(
  color: string | undefined,
  disabled: boolean | undefined,
): ITextStyle {
  const style: ITextStyle = { ...buttonTextStyle };
  if (color !== undefined) style.color = color;
  if (disabled === true) style.color = IOS_DISABLED_GREY;
  return style;
}
