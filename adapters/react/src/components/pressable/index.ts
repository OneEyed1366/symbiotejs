// Pressable: the React lifecycle half. The press lifecycle (the long-press timer, unstable_press-
// Delay deferral, the pressRetentionOffset drift test, the suppression flags) lives in
// @symbiote/components/state as a pure machine over a runtime + host; the render decisions (the
// responder listeners, the disabled→accessibilityState fold, the ripple prop) in
// @symbiote/components/view. Here React owns only the lifecycle: useState for `pressed`, a ref for
// the runtime, a ref for the View instance (the measure handle), and a useMemo that rebuilds the
// handlers when the config changes. This is the React twin of the Vue adapter's setup-scope
// runtime + setPressed ref.
//
// Three RN interaction props that change real app feel ride on top of the shared synthesis,
// entirely in JS: android_ripple (an Android native-feedback prop on a dedicated inner View, inert
// on iOS), unstable_pressDelay, and pressRetentionOffset (the drift region), all handled by the
// shared machine; here we only wire its host + render the View.

import { createElement, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import {
  createPressHandlers,
  createPressRuntime,
  rippleProps,
  buildPressableListeners,
  resolveDisabledAccessibilityState,
  noteHoverNoop,
  DEFAULT_DELAY_LONG_PRESS_MS,
  type IPressHost,
  type IPressState,
  type IPressHandler,
  type IRectOffset,
  type IPressableAndroidRippleConfig,
} from '@symbiote/components';
import { View } from '../../components';
import type { IHostInstance } from '../../host-instance';
import type {
  IAccessibilityProps,
  IAccessibilityStateValue,
  IAriaProps,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type { IPressState, IPressableAndroidRippleConfig } from '@symbiote/components';

type IPressableStyle = IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
type IChildrenProp = ReactNode | ((state: IPressState) => ReactNode);

export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  // Fires on every responder move while the press is live (RN Pressable.js onPressMove
  // → Pressability onResponderMove). Distinct from the retention drift bookkeeping.
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  // false refuses to yield the responder when another view (e.g. a parent ScrollView) asks to
  // take over. RN forwards this to onResponderTerminationRequest, default true.
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  // Extra distance outside the visual bounds in which a drifting press stays active before
  // pressOut fires (RN Pressable.js:78). A scalar applies to every edge.
  pressRetentionOffset?: IRectOffset;
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate.
  unstable_pressDelay?: number;
  // Android-only ripple feedback; inert on iOS (RN Pressable.js:146).
  android_ripple?: IPressableAndroidRippleConfig;
  // Suppress the Android system tap sound (RN Pressable.js:141). Forwarded to native.
  android_disableSound?: boolean;
  // Pointer-hover callbacks (RN onHoverIn/onHoverOut). This host has no pointer-enter/leave event,
  // so they are accepted, typed, and forwarded but inert (a dlog notes the no-op).
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  style?: IPressableStyle;
  // Unlike `style`, never a function of press state — a CSS class is compiled statically, so
  // only the truly static half of a Pressable's look can move here; a press-state-dependent
  // look still needs `style`'s function form.
  className?: string;
  children?: IChildrenProp;
}

function resolveStyle(
  style: IPressableStyle | undefined,
  state: IPressState,
): IStyleProp<IViewStyle> | undefined {
  if (typeof style === 'function') return style(state);
  return style;
}

function resolveChildren(children: IChildrenProp | undefined, state: IPressState): ReactNode {
  if (typeof children === 'function') return children(state);
  return children;
}

export const Pressable: FC<IPressableProps> = props => {
  const {
    onPress,
    onPressIn,
    onPressOut,
    onPressMove,
    onLongPress,
    delayLongPress = DEFAULT_DELAY_LONG_PRESS_MS,
    disabled,
    cancelable,
    hitSlop,
    pressRetentionOffset,
    unstable_pressDelay = 0,
    android_ripple,
    android_disableSound,
    onHoverIn,
    onHoverOut,
    delayHoverIn,
    delayHoverOut,
    accessibilityState,
    testID,
    style,
    children,
    // The remaining accessibility / aria props forward to View untouched; View runs
    // resolveAccessibilityProps, so aria/role fold there, once.
    ...accessibilityRest
  } = props;

  const [pressed, setPressed] = useState(false);
  // The mutable press runtime (timers, suppression flags, measured region), a ref so mutating it
  // never triggers a re-render; only setPressed does.
  const runtime = useRef(createPressRuntime()).current;
  // The View instance, so the machine can measure its on-screen rect on responder grant.
  const viewRef = useRef<IHostInstance | null>(null);

  // The lifecycle seam the machine fills: flip pressed-state, and expose the View's raw measure.
  const host = useMemo<IPressHost>(
    () => ({
      setPressed,
      getMeasureFn: () => {
        const view = viewRef.current;
        if (view === null) return undefined;
        return callback => view.measure(callback);
      },
      schedule: (callback, ms) => {
        const id = setTimeout(callback, ms);
        return () => clearTimeout(id);
      },
    }),
    [],
  );

  const handlers = useMemo(
    () =>
      createPressHandlers(
        {
          onPress,
          onPressIn,
          onPressOut,
          onPressMove,
          onLongPress,
          delayLongPress,
          unstable_pressDelay,
          hitSlop,
          pressRetentionOffset,
        },
        runtime,
        host,
      ),
    [
      onPress,
      onPressIn,
      onPressOut,
      onPressMove,
      onLongPress,
      delayLongPress,
      unstable_pressDelay,
      hitSlop,
      pressRetentionOffset,
      runtime,
      host,
    ],
  );

  noteHoverNoop(onHoverIn, onHoverOut);
  void delayHoverIn;
  void delayHoverOut;

  const state: IPressState = { pressed };

  const resolvedAccessibilityState: IAccessibilityStateValue | undefined =
    resolveDisabledAccessibilityState(accessibilityState, disabled);

  const viewProps: Record<string, unknown> = {
    ...accessibilityRest,
    // The ref is the handle the retention measure reaches through (measure on grant).
    ref: viewRef,
    style: resolveStyle(style, state),
    hitSlop,
    accessibilityState: resolvedAccessibilityState,
    testID,
  };
  // Forward the Android tap-sound suppressor under RN's own key; inert on iOS.
  if (android_disableSound !== undefined) viewProps.android_disableSound = android_disableSound;
  Object.assign(viewProps, buildPressableListeners(handlers, { disabled, cancelable }));

  // android_ripple rides a dedicated inner View (the Pressable's own View only forwards a fixed
  // prop set), mirroring touchable-native-feedback. On iOS the ripple prop is undefined, so the
  // child renders unwrapped, no extra node.
  const ripple = android_ripple !== undefined ? rippleProps(android_ripple) : undefined;
  const content = resolveChildren(children, state);
  const inner = ripple !== undefined ? createElement(View, ripple, content) : content;

  return createElement(View, viewProps, inner);
};
