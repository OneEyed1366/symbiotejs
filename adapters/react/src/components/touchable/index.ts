// The Touchable* family, all built on Pressable. RN realizes their feedback with Animated, and so
// do we. The press-timing constants and the deactivation-floor math are shared with every adapter
// (@symbiote-native/components/state/touchable); here React owns only the Animated wiring + the press
// scheduling refs:
//   TouchableOpacity:   animate an Animated.Value opacity toward activeOpacity on press-in and
//     back to 1 on press-out, driven imperatively from onPressIn/onPressOut.
//   TouchableHighlight: paint underlayColor + lower child opacity while pressed, via Pressable's
//     pressed-state style (RN drives this with setState, not Animated, faithfully).
//   TouchableWithoutFeedback: no visual change, just the press wiring.

import { createElement, useRef, type FC, type ReactNode } from 'react';
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
  type IPressTimingProps,
} from '@symbiote-native/components';
import { Pressable, type IPressableProps, type IPressState } from '../pressable';
import { Animated } from '../../modules/animated';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

type ITouchableBaseProps = Omit<IPressableProps, 'style' | 'children'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
    children?: ReactNode;
  };

export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

// The real setTimeout the shared feedback machine schedules its deferred activation/deactivation on
// (core/components has no timer globals). Returns a canceller so an early release flushes the timer.
function scheduleTimeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => clearTimeout(id);
}

export const TouchableOpacity: FC<ITouchableOpacityProps> = props => {
  const {
    activeOpacity = DEFAULT_ACTIVE_OPACITY,
    style,
    // className is pulled out here, like style, and applied to the inner Animated.View below —
    // left in ...rest it would land on the outer Pressable instead, which is not where `style`
    // (the opacity-fade node) goes.
    className,
    children,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    minPressDuration = DEFAULT_MIN_PRESS_DURATION_MS,
    ...rest
  } = props;

  // One Animated.Value per mount, resting at full opacity. The Animated.View leaf commits its
  // current value every frame, so timing it animates the real view.
  const opacity = useRef(new Animated.Value(RESTING_OPACITY)).current;
  // The shared press-scheduling cell (delayPressIn timer + activation clock), held across renders.
  const runtime = useRef(createTouchableFeedbackRuntime()).current;

  function setOpacityTo(toValue: number, duration: number): void {
    Animated.timing(opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: false,
    }).start();
  }

  // The shared machine owns the delayPressIn/minPressDuration scheduling; the adapter supplies only
  // the native seam — the Animated opacity fade + the framework emit — as activate/deactivate.
  const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
    { delayPressIn, delayPressOut, minPressDuration, schedule: scheduleTimeout, now: Date.now },
    runtime,
    {
      activate(event) {
        setOpacityTo(activeOpacity, OPACITY_ACTIVE_DURATION_MS);
        onPressIn?.(event);
      },
      deactivate(event) {
        setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS);
        onPressOut?.(event);
      },
    },
  );

  return createElement(
    Pressable,
    { ...rest, onPressIn: handlePressIn, onPressOut: handlePressOut },
    createElement(Animated.View, { style: [style, { opacity }], className }, children),
  );
};

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
}

export const TouchableHighlight: FC<ITouchableHighlightProps> = props => {
  const {
    activeOpacity = DEFAULT_HIGHLIGHT_CHILD_OPACITY,
    underlayColor = DEFAULT_UNDERLAY_COLOR,
    style,
    children,
    ...rest
  } = props;

  function pressedStyle({ pressed }: IPressState): IStyleProp<IViewStyle> {
    return highlightPressedStyle(pressed, style, underlayColor, activeOpacity);
  }

  return createElement(Pressable, { ...rest, style: pressedStyle }, children);
};

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps;

export const TouchableWithoutFeedback: FC<ITouchableWithoutFeedbackProps> = props => {
  const { children, ...rest } = props;
  return createElement(Pressable, rest, children);
};
