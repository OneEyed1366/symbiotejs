// The Touchable* family for Vue, all built on Pressable, the Vue twin of the React adapter. The
// press-timing constants and the deactivation-floor math are shared with React
// (@symbiote-native/components/state/touchable); here Vue owns only the Animated wiring + the press
// scheduling state:
//   TouchableOpacity: animate an Animated.Value opacity toward activeOpacity on press-in, back
//     to 1 on press-out, driven from Pressable's onPressIn/onPressOut.
//   TouchableHighlight: paint underlayColor + lower child opacity while pressed, via Pressable's
//     style-as-function (the pressed state RN drives with setState).
//   TouchableWithoutFeedback: no visual change, just the press wiring.
//
// Inputs arrive as attrs (untyped), narrowed with runtime guards. The handlers read attrs LIVE
// (they fire on events, not render) so a re-supplied callback / timing is always honored.

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import {
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  highlightPressedStyle,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_MIN_PRESS_DURATION_MS,
  DEFAULT_UNDERLAY_COLOR,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  type IPressState,
  type IPressTimingProps,
} from '@symbiote-native/components';
import { type ISymbioteEvent, type IStyleProp, type IViewStyle } from '@symbiote-native/engine';
import {
  Pressable,
  emitPressableEvents,
  PRESSABLE_EMITS,
  type IPressableEmits,
  type IPressableProps,
} from './pressable';
import { Animated } from '../modules/animated';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

type ITouchableBaseProps = Omit<IPressableProps, 'style'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
  };

// `class` is already typed here via ITouchableBaseProps' Omit<IPressableProps, 'style'> (Omit
// only strips `style`), but ROUTING it needs the same explicit treatment as `style`:
// TouchableOpacity renders its OWN Animated.View feedback node (the opacity fade) inside
// Pressable's host View, the same wrapper/inner split ImageBackground has. `style` already
// targets that inner Animated.View (see TOUCHABLE_OPACITY_HANDLED); `class` must land on it
// too, not the outer Pressable wrapper it would otherwise reach via forwardExcept.
export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
}

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps;

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// The real setTimeout the shared feedback machine schedules its deferred activation/deactivation on
// (core/components has no timer globals). Returns a canceller so an early release flushes the timer.
function scheduleTimeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => clearTimeout(id);
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
  'class',
  'onPressIn',
  'onPressOut',
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
];

export const TouchableOpacity = defineComponent<ITouchableOpacityProps, IPressableEmits>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    // One Animated.Value per mount, resting at full opacity. Held by identity in setup scope (an
    // engine object, never a reactive ref). The Animated.View leaf commits it every frame.
    const opacity = new Animated.Value(RESTING_OPACITY);
    // The shared press-scheduling cell (delayPressIn timer + activation clock), persisted across
    // renders in setup scope; the handlers are rebuilt each render over live attrs.
    const runtime = createTouchableFeedbackRuntime();

    function setOpacityTo(toValue: number, duration: number): void {
      Animated.timing(opacity, {
        toValue,
        duration,
        easing: Animated.Easing.inOut(Animated.Easing.quad),
        useNativeDriver: false,
      }).start();
    }

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const style = attrs.style;
      // Rebuilt each render so a re-supplied delay/opacity is honored (Vue's live-attr idiom); the
      // shared machine owns the scheduling, the adapter supplies the Animated fade + emit.
      const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
        {
          delayPressIn: numberOr(attrs.delayPressIn, 0),
          delayPressOut: numberOr(attrs.delayPressOut, 0),
          minPressDuration: numberOr(attrs.minPressDuration, DEFAULT_MIN_PRESS_DURATION_MS),
          schedule: scheduleTimeout,
          now: Date.now,
        },
        runtime,
        {
          activate(event: ISymbioteEvent): void {
            setOpacityTo(
              numberOr(attrs.activeOpacity, DEFAULT_ACTIVE_OPACITY),
              OPACITY_ACTIVE_DURATION_MS,
            );
            emit('pressIn', event);
          },
          deactivate(event: ISymbioteEvent): void {
            setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS);
            emit('pressOut', event);
          },
        },
      );
      const pressableProps: Record<string, unknown> = {
        ...forwardExcept(attrs, TOUCHABLE_OPACITY_HANDLED),
        ...emitPressableEvents(emit),
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
      };
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      const feedback = h(
        Animated.View,
        { style: [style, { opacity }], class: attrs.class },
        () => children,
      );
      return h(Pressable, pressableProps, { default: () => [feedback] });
    };
  },
  {
    name: 'TouchableOpacity',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);

const TOUCHABLE_HIGHLIGHT_HANDLED = ['activeOpacity', 'underlayColor', 'style'];

export const TouchableHighlight = defineComponent<ITouchableHighlightProps, IPressableEmits>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const activeOpacity = numberOr(attrs.activeOpacity, DEFAULT_HIGHLIGHT_CHILD_OPACITY);
      const underlayColor =
        typeof attrs.underlayColor === 'string' ? attrs.underlayColor : DEFAULT_UNDERLAY_COLOR;
      const style = attrs.style;

      function pressedStyle({ pressed }: IPressState): unknown {
        return highlightPressedStyle(pressed, style, underlayColor, activeOpacity);
      }

      const pressableProps: Record<string, unknown> = {
        ...forwardExcept(attrs, TOUCHABLE_HIGHLIGHT_HANDLED),
        ...emitPressableEvents(emit),
        style: pressedStyle,
      };
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      return h(Pressable, pressableProps, { default: () => children });
    };
  },
  {
    name: 'TouchableHighlight',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);

export const TouchableWithoutFeedback = defineComponent<
  ITouchableWithoutFeedbackProps,
  IPressableEmits
>(
  (_props, { slots, attrs: rawAttrs, emit }) => {
    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const children: VNode[] = slots.default !== undefined ? slots.default() : [];
      return h(Pressable, { ...attrs, ...emitPressableEvents(emit) }, { default: () => children });
    };
  },
  {
    name: 'TouchableWithoutFeedback',
    inheritAttrs: false,
    emits: PRESSABLE_EMITS,
  },
);
