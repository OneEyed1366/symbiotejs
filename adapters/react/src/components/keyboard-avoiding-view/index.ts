// KeyboardAvoidingView: composes the host View and shifts it out of the keyboard's way as
// the keyboard shows/hides. It subscribes to the Keyboard module (native->JS events) and
// recomputes a bottom inset from the keyboard frame and the view's own measured frame.
// Mirrors RN's Libraries/Components/Keyboard/KeyboardAvoidingView.js, as a function component.
//
// The inset math + the behavior → style/structure decision are framework-agnostic and live in
// @symbiote/components (render-keyboard-avoiding-view), shared verbatim with the Vue adapter.
// React supplies only the lifecycle: useState for the inset, useRef for the measured frame, a
// useEffect subscription, and the descriptor-free element assembly around its children.

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactElement,
  type ReactNode,
} from 'react';
import { dlog, type ISymbioteEvent } from '@symbiote/engine';
import {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IKeyboardAvoidingBehavior,
  type IMeasuredFrame,
} from '@symbiote/components';
import { View, type IViewProps } from '../../components';
import { Keyboard, KEYBOARD_EVENT } from '../../modules/keyboard';
import type { IAccessibilityProps, IAriaProps } from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type { IKeyboardAvoidingBehavior } from '@symbiote/components';

export interface IKeyboardAvoidingViewProps extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  // When false, the view passes through untouched; no inset is applied in any
  // behavior mode. RN gates every inset/height computation on `enabled ?? true`
  // (KeyboardAvoidingView.js); default true.
  enabled?: boolean;
  // Distance from the top of the screen to this view; subtracted from the inset
  // so a view that doesn't start at y=0 still clears the keyboard exactly.
  keyboardVerticalOffset?: number;
  // Style of the inner content container, used only when behavior is 'position'.
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  // Not destructured below, so it lands in ...accessibilityRest and forwards onto the wrapper
  // View, which already resolves className. contentContainerStyle stays JS-only (a plain
  // style-object prop, not style/className itself).
  className?: string;
  children?: ReactNode;
  onLayout?: (event: ISymbioteEvent) => void;
}

export const KeyboardAvoidingView: FC<IKeyboardAvoidingViewProps> = props => {
  const {
    behavior,
    enabled = true,
    keyboardVerticalOffset = DEFAULT_VERTICAL_OFFSET,
    contentContainerStyle,
    style,
    children,
    onLayout,
    // The wrapper is the View FC, which runs resolveAccessibilityProps itself, so
    // the raw aria/role + accessibility* props pass through untouched here and fold
    // there once.
    ...accessibilityRest
  } = props;

  const [inset, setInset] = useState(0);
  // Mutable, not state: changing the frame alone shouldn't re-render; it feeds the
  // next keyboard event's inset math.
  const frameRef = useRef<IMeasuredFrame | undefined>(undefined);
  const initialHeightRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onShow = (payload: unknown): void => {
      const keyboard = readKeyboardFrame(payload);
      const next = computeInset(frameRef.current, keyboard, keyboardVerticalOffset);
      dlog(`KeyboardAvoidingView show -> inset ${next}`);
      setInset(next);
    };
    const onHide = (): void => {
      dlog('KeyboardAvoidingView hide -> inset 0');
      setInset(0);
    };

    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didChangeFrame, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, onHide),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [keyboardVerticalOffset]);

  const handleLayout = (event: ISymbioteEvent): void => {
    const frame = readLayoutFrame(event.nativeEvent.layout);
    if (frame !== undefined) {
      frameRef.current = frame;
      if (initialHeightRef.current === undefined) initialHeightRef.current = frame.height;
    }
    onLayout?.(event);
  };

  // When disabled the inset is forced to 0, so every behavior mode renders the view
  // untouched (RN gates each bottomHeight/height computation on `enabled ?? true`).
  const effectiveInset = enabled ? inset : 0;

  const layout = resolveKeyboardAvoidingLayout({
    behavior,
    effectiveInset,
    initialHeight: initialHeightRef.current,
    style,
    contentContainerStyle,
  });

  // 'nested' ('position') pushes the content in an inner View by `bottom: inset`; the wrapper
  // modes adjust the single wrapper directly.
  if (layout.kind === 'nested') {
    return renderWrapper(
      layout.wrapperStyle,
      createElement(View, { style: layout.innerStyle }, children),
    );
  }
  return renderWrapper(layout.wrapperStyle, children);

  // The wrapper carries onLayout. The View FC's public props don't surface it, but
  // `symbiote-view` routes the base layout event at runtime; widen the props through
  // a typed variable (no inline-literal excess-property check, no `as`) so the
  // onLayout reaches the host without editing View's public type.
  function renderWrapper(
    wrapStyle: IStyleProp<IViewStyle> | undefined,
    content: ReactNode,
  ): ReactElement {
    const wrapperProps: IViewProps & { onLayout: (event: ISymbioteEvent) => void } = {
      ...accessibilityRest,
      style: wrapStyle,
      onLayout: handleLayout,
      children: content,
    };
    return createElement(View, wrapperProps);
  }
};
