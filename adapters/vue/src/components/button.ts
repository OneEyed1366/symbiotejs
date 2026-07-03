// Button for Vue. The minimal cross-platform button in RN's iOS shape (Button.js): a
// TouchableOpacity wrapping a Text. The base text style, the role constant, and the color fold are
// shared in @symbiotejs/components/view; here Vue only composes its TouchableOpacity + Text and
// forwards the native-only props. The Vue twin of the React adapter's Button.

import { defineComponent, h } from '@vue/runtime-core';
import {
  BUTTON_ACCESSIBILITY_ROLE,
  resolveButtonTextStyle,
  type IButtonProps as ICoreButtonProps,
} from '@symbiotejs/components';
import type { IClassNameValue, ISymbioteEvent } from '@symbiotejs/engine';
import { Text } from '../components';
import { TouchableOpacity } from './touchable';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

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

// ICoreButtonProps is the framework-agnostic shared type (@symbiotejs/components); `class` can't
// live there, so it's added locally, exactly like Image's IImageProps. Not in HANDLED above, so
// it forwards via forwardAttrs onto the TouchableOpacity, which (after its own fix) routes it to
// the same Animated.View `style` targets.
export type IButtonProps = Omit<ICoreButtonProps, 'onPress'> & { class?: IClassNameValue };

type IButtonEmits = {
  press: (event: ISymbioteEvent) => boolean;
};

export const Button = defineComponent<IButtonProps, IButtonEmits>(
  (_props, { attrs: rawAttrs, emit }) => {
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
        onPress: (event: ISymbioteEvent) => emit('press', event),
      };
      return h(TouchableOpacity, touchableProps, {
        default: () => [h(Text, { style: textStyle }, () => title)],
      });
    };
  },
  {
    name: 'Button',
    inheritAttrs: false,
    emits: {
      press: (_event: ISymbioteEvent): boolean => true,
    },
  },
);
