// Button for Vue. The minimal cross-platform button in RN's iOS shape (Button.js): a
// TouchableOpacity wrapping a Text. The base text style, the role constant, and the color fold are
// shared in @symbiote/components/view; here Vue only composes its TouchableOpacity + Text and
// forwards the native-only props. The Vue twin of the React adapter's Button.

import { defineComponent, h, type SetupContext } from '@vue/runtime-core';
import { BUTTON_ACCESSIBILITY_ROLE, resolveButtonTextStyle } from '@symbiote/components';
import { Text } from './components';
import { TouchableOpacity } from './touchable';
import { normalizeVueAttrs } from './normalize-attrs';

// The props Button consumes / re-maps itself; everything else (accessibility, aria, TV-focus,
// testID, nativeID) forwards to the TouchableOpacity. `title` becomes the Text child; onPress and
// disabled re-map; touchSoundDisabled maps to the pressable's android_disableSound.
const HANDLED = [
  'title',
  'color',
  'touchSoundDisabled',
  'accessibilityRole',
  'accessible',
  'accessibilityState',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export const Button = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs }: SetupContext) {
    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const title = typeof attrs.title === 'string' ? attrs.title : '';
      const color = typeof attrs.color === 'string' ? attrs.color : undefined;
      const disabled = attrs.disabled === true ? true : undefined;
      const touchSoundDisabled = attrs.touchSoundDisabled === true ? true : undefined;

      const textStyle = resolveButtonTextStyle(color, disabled);

      // RN's Button sets role=button, is accessible, and propagates the disabled accessibility
      // state. The caller's props pass through, but Button's fixed role / accessible / disabled-
      // state win, applied after the forwarded spread. touchSoundDisabled → android_disableSound.
      const touchableProps: Record<string, unknown> = {
        ...forwardAttrs(attrs),
        disabled,
        android_disableSound: touchSoundDisabled,
        accessibilityRole: BUTTON_ACCESSIBILITY_ROLE,
        accessible: true,
        accessibilityState: { disabled },
      };
      return h(TouchableOpacity, touchableProps, {
        default: () => [h(Text, { style: textStyle }, title)],
      });
    };
  },
});
