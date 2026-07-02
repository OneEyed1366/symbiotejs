// The Touchable* family, all built on Pressable. RN realizes their feedback with Animated, and so
// do we. The press-timing constants and the deactivation-floor math are shared with every adapter
// (@symbiote/components/state/touchable); here React owns only the Animated wiring + the press
// scheduling refs:
//   TouchableOpacity:   animate an Animated.Value opacity toward activeOpacity on press-in and
//     back to 1 on press-out, driven imperatively from onPressIn/onPressOut.
//   TouchableHighlight: paint underlayColor + lower child opacity while pressed, via Pressable's
//     pressed-state style (RN drives this with setState, not Animated, faithfully).
//   TouchableWithoutFeedback: no visual change, just the press wiring.

import { createElement, useRef, type FC, type ReactNode } from 'react';
import { dlog, type ISymbioteEvent } from '@symbiote/engine';
import {
  computePressOutWait,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_MIN_PRESS_DURATION_MS,
  DEFAULT_UNDERLAY_COLOR,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  type IPressTimingProps,
} from '@symbiote/components';
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
  // The pending delayPressIn timer, so a release before it fires can flush it.
  const pressInTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // When the active visual actually started, to floor onPressOut by minPressDuration.
  const activatedAt = useRef<number | undefined>(undefined);

  function setOpacityTo(toValue: number, duration: number): void {
    Animated.timing(opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: false,
    }).start();
  }

  function clearPressInTimer(): void {
    if (pressInTimer.current !== undefined) {
      clearTimeout(pressInTimer.current);
      pressInTimer.current = undefined;
    }
  }

  function activate(event: ISymbioteEvent): void {
    activatedAt.current = Date.now();
    setOpacityTo(activeOpacity, OPACITY_ACTIVE_DURATION_MS);
    onPressIn?.(event);
  }

  function deactivate(event: ISymbioteEvent): void {
    activatedAt.current = undefined;
    setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS);
    onPressOut?.(event);
  }

  // RN's _createPressabilityConfig forwards delayPressIn: defer the active visual and onPressIn
  // behind the delay (a release before it elapses flushes it synchronously).
  function handlePressIn(event: ISymbioteEvent): void {
    if (delayPressIn > 0) {
      dlog(`TouchableOpacity pressIn deferred ${delayPressIn}ms`);
      pressInTimer.current = setTimeout(() => {
        pressInTimer.current = undefined;
        activate(event);
      }, delayPressIn);
      return;
    }
    activate(event);
  }

  // delayPressOut + minPressDuration (RN _deactivate): the press-out waits at least minPress-
  // Duration past activation (so a fast tap holds the active visual) and at least delayPressOut.
  function handlePressOut(event: ISymbioteEvent): void {
    if (pressInTimer.current !== undefined) {
      clearPressInTimer();
      activate(event);
    }
    const heldFor = activatedAt.current === undefined ? 0 : Date.now() - activatedAt.current;
    const wait = computePressOutWait(heldFor, minPressDuration, delayPressOut);
    if (wait > 0) {
      dlog(`TouchableOpacity pressOut deferred ${wait}ms`);
      setTimeout(() => deactivate(event), wait);
      return;
    }
    deactivate(event);
  }

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
    if (!pressed) return style;
    return [style, { backgroundColor: underlayColor, opacity: activeOpacity }];
  }

  return createElement(Pressable, { ...rest, style: pressedStyle }, children);
};

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps;

export const TouchableWithoutFeedback: FC<ITouchableWithoutFeedbackProps> = props => {
  const { children, ...rest } = props;
  return createElement(Pressable, rest, children);
};
