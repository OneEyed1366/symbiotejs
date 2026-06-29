// The Touchable* family for Vue, all built on Pressable, the Vue twin of the React adapter. The
// press-timing constants and the deactivation-floor math are shared with React
// (@symbiote/components/state/touchable); here Vue owns only the Animated wiring + the press
// scheduling state:
//   TouchableOpacity: animate an Animated.Value opacity toward activeOpacity on press-in, back
//     to 1 on press-out, driven from Pressable's onPressIn/onPressOut.
//   TouchableHighlight: paint underlayColor + lower child opacity while pressed, via Pressable's
//     style-as-function (the pressed state RN drives with setState).
//   TouchableWithoutFeedback: no visual change, just the press wiring.
//
// Inputs arrive as attrs (untyped), narrowed with runtime guards. The handlers read attrs LIVE
// (they fire on events, not render) so a re-supplied callback / timing is always honored.

import { defineComponent, h, type SetupContext, type VNode } from '@vue/runtime-core';
import {
  computePressOutWait,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_MIN_PRESS_DURATION_MS,
  DEFAULT_UNDERLAY_COLOR,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  type IPressState,
} from '@symbiote/components';
import { dlog, type ISymbioteEvent, type IViewStyle } from '@symbiote/engine';
import { Pressable } from './pressable';
import { Animated } from './animated';
import { normalizeVueAttrs } from './normalize-attrs';

function isHandler(value: unknown): value is (event: ISymbioteEvent) => void {
  return typeof value === 'function';
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function forwardExcept(
  attrs: Record<string, unknown>,
  handled: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!handled.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const TOUCHABLE_OPACITY_HANDLED = [
  'activeOpacity',
  'style',
  'onPressIn',
  'onPressOut',
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
];

export const TouchableOpacity = defineComponent({
  name: 'TouchableOpacity',
  inheritAttrs: false,
  setup(_props, { slots, attrs: rawAttrs }: SetupContext) {
    // One Animated.Value per mount, resting at full opacity. Held by identity in setup scope (an
    // engine object, never a reactive ref). The Animated.View leaf commits it every frame.
    const opacity = new Animated.Value(RESTING_OPACITY);
    let pressInTimer: ReturnType<typeof setTimeout> | undefined;
    let activatedAt: number | undefined;

    function setOpacityTo(toValue: number, duration: number): void {
      Animated.timing(opacity, {
        toValue,
        duration,
        easing: Animated.Easing.inOut(Animated.Easing.quad),
        useNativeDriver: false,
      }).start();
    }

    function clearPressInTimer(): void {
      if (pressInTimer !== undefined) {
        clearTimeout(pressInTimer);
        pressInTimer = undefined;
      }
    }

    function activate(event: ISymbioteEvent): void {
      activatedAt = Date.now();
      setOpacityTo(
        numberOr(rawAttrs.activeOpacity, DEFAULT_ACTIVE_OPACITY),
        OPACITY_ACTIVE_DURATION_MS,
      );
      if (isHandler(rawAttrs.onPressIn)) rawAttrs.onPressIn(event);
    }

    function deactivate(event: ISymbioteEvent): void {
      activatedAt = undefined;
      setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS);
      if (isHandler(rawAttrs.onPressOut)) rawAttrs.onPressOut(event);
    }

    function handlePressIn(event: ISymbioteEvent): void {
      const delayPressIn = numberOr(rawAttrs.delayPressIn, 0);
      if (delayPressIn > 0) {
        dlog(`TouchableOpacity pressIn deferred ${delayPressIn}ms`);
        pressInTimer = setTimeout(() => {
          pressInTimer = undefined;
          activate(event);
        }, delayPressIn);
        return;
      }
      activate(event);
    }

    function handlePressOut(event: ISymbioteEvent): void {
      if (pressInTimer !== undefined) {
        clearPressInTimer();
        activate(event);
      }
      const heldFor = activatedAt === undefined ? 0 : Date.now() - activatedAt;
      const wait = computePressOutWait(
        heldFor,
        numberOr(rawAttrs.minPressDuration, DEFAULT_MIN_PRESS_DURATION_MS),
        numberOr(rawAttrs.delayPressOut, 0),
      );
      if (wait > 0) {
        dlog(`TouchableOpacity pressOut deferred ${wait}ms`);
        setTimeout(() => deactivate(event), wait);
        return;
      }
      deactivate(event);
    }

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const style = attrs.style;
      const pressableProps: Record<string, unknown> = {
        ...forwardExcept(attrs, TOUCHABLE_OPACITY_HANDLED),
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
      };
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      const feedback = h(Animated.View, { style: [style, { opacity }] }, () => children);
      return h(Pressable, pressableProps, { default: () => [feedback] });
    };
  },
});

const TOUCHABLE_HIGHLIGHT_HANDLED = ['activeOpacity', 'underlayColor', 'style'];

export const TouchableHighlight = defineComponent({
  name: 'TouchableHighlight',
  inheritAttrs: false,
  setup(_props, { slots, attrs: rawAttrs }: SetupContext) {
    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const activeOpacity = numberOr(attrs.activeOpacity, DEFAULT_HIGHLIGHT_CHILD_OPACITY);
      const underlayColor =
        typeof attrs.underlayColor === 'string' ? attrs.underlayColor : DEFAULT_UNDERLAY_COLOR;
      const style = attrs.style;

      function pressedStyle({ pressed }: IPressState): unknown {
        if (!pressed) return style;
        const overlay: IViewStyle = { backgroundColor: underlayColor, opacity: activeOpacity };
        return [style, overlay];
      }

      const pressableProps: Record<string, unknown> = {
        ...forwardExcept(attrs, TOUCHABLE_HIGHLIGHT_HANDLED),
        style: pressedStyle,
      };
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      return h(Pressable, pressableProps, { default: () => children });
    };
  },
});

export const TouchableWithoutFeedback = defineComponent({
  name: 'TouchableWithoutFeedback',
  inheritAttrs: false,
  setup(_props, { slots, attrs: rawAttrs }: SetupContext) {
    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      return h(Pressable, { ...attrs }, { default: () => children });
    };
  },
});
