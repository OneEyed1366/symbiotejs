// TouchableNativeFeedback for Vue: Android's ripple/state-drawable touchable, built on Pressable
// like the rest of the family (the Vue twin of the React adapter). The native ripple props
// (nativeBackgroundAndroid / nativeForegroundAndroid) ride a dedicated feedback View nested under
// the Pressable; on iOS they are inert. The static factories + background mapping are shared in
// @symbiotejs/components/view; Vue only attaches them onto the component value and nests the View.

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import {
  backgroundProps,
  canUseNativeForeground,
  rippleBackground,
  selectableBackground,
  selectableBackgroundBorderless,
  type INativeFeedbackBackground,
} from '@symbiotejs/components';
import { dlog } from '@symbiotejs/engine';
import { View } from '../components';
import {
  Pressable,
  emitPressableEvents,
  PRESSABLE_EMITS,
  type IPressableEmits,
  type IPressableProps,
} from './pressable';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiotejs/components';

export type ITouchableNativeFeedbackProps = Omit<IPressableProps, 'style'> & {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
};

const HANDLED = ['background', 'useForeground'];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED.includes(key)) result[key] = attrs[key];
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `background` arrives untyped; narrow it to the discriminated union the mapping reads, else
// undefined (the impl then defaults to SelectableBackground, like RN).
function asBackground(value: unknown): INativeFeedbackBackground | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'ThemeAttrAndroid') {
    if (
      value.attribute === 'selectableItemBackground' ||
      value.attribute === 'selectableItemBackgroundBorderless'
    ) {
      return {
        type: 'ThemeAttrAndroid',
        attribute: value.attribute,
        rippleRadius: typeof value.rippleRadius === 'number' ? value.rippleRadius : undefined,
      };
    }
    return undefined;
  }
  if (value.type === 'RippleAndroid') {
    return {
      type: 'RippleAndroid',
      color: typeof value.color === 'string' ? value.color : null,
      borderless: value.borderless === true,
      rippleRadius: typeof value.rippleRadius === 'number' ? value.rippleRadius : undefined,
    };
  }
  return undefined;
}

const TouchableNativeFeedbackImpl = defineComponent<ITouchableNativeFeedbackProps, IPressableEmits>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const useForeground = attrs.useForeground === true;
      // RN defaults a missing background to SelectableBackground() so the touchable always shows
      // feedback; mirror that here.
      const resolved = asBackground(attrs.background) ?? selectableBackground();
      dlog(`TouchableNativeFeedback render ${resolved.type} useForeground ${useForeground}`);

      const nativeProps = backgroundProps(resolved, useForeground);
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      const feedback = h(View, nativeProps, () => children);
      return h(
        Pressable,
        { ...forwardAttrs(attrs), ...emitPressableEvents(emit) },
        { default: () => [feedback] },
      );
    };
  },
  {
    name: 'TouchableNativeFeedback',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);

// The static factories live on the component value so callers reach TouchableNativeFeedback.Ripple(…)
// exactly like RN. Object.assign onto the defineComponent return (a plain object) keeps the typing.
export const TouchableNativeFeedback = Object.assign(TouchableNativeFeedbackImpl, {
  SelectableBackground: selectableBackground,
  SelectableBackgroundBorderless: selectableBackgroundBorderless,
  Ripple: rippleBackground,
  canUseNativeForeground,
});
