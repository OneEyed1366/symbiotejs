// KeyboardAvoidingView: the Vue lifecycle half. The inset math + the behavior → style/structure
// decision live in @symbiote/components (render-keyboard-avoiding-view), shared verbatim with the
// React adapter; Vue supplies only the reactivity: a ref holds the inset, onMounted subscribes to
// the now-core Keyboard module (show / changeFrame / hide), onUnmounted tears the subscriptions
// down, and onLayout measures the wrapper frame that feeds the next event's inset. This is the Vue
// twin of React's useState + useEffect + onLayout. Full parity: behavior 'height'|'position'|
// 'padding', enabled, keyboardVerticalOffset, contentContainerStyle, onLayout.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard rather than a cast.
// rawAttrs runs through normalizeVueAttrs (kebab→camel) so a template `:keyboard-vertical-offset`
// and `:content-container-style` resolve; aria-*/data-* are preserved and forwarded to the host.

import { defineComponent, h, ref, onMounted, onUnmounted, type VNode } from '@vue/runtime-core';
import {
  Keyboard,
  KEYBOARD_EVENT,
  dlog,
  type ISymbioteEvent,
  type IEventSubscription,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote/engine';
import {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
  resolveAccessibilityProps,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
  type IMeasuredFrame,
} from '@symbiote/components';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// The Vue-facing prop surface. layout is NOT here: it is a typed Vue emit (@layout), wrapper-composed
// from the wrapper's own onLayout (which the component already intercepts to measure the frame).
export interface IKeyboardAvoidingViewProps extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  enabled?: boolean;
  keyboardVerticalOffset?: number;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  // Not in HANDLED_ATTRS below — passes through untouched onto the wrapper host, which already
  // resolves `class`. contentContainerStyle stays JS-only (a plain style-object prop, not
  // `style`/`class` itself — see the symbiote-sfc-style-compiler skill).
  class?: IClassNameValue;
  testID?: string;
}

export type IKeyboardAvoidingViewEmits = {
  layout: (event: ISymbioteEvent) => boolean;
};

// A style prop is an object (a style record) or an array of them; numbers/strings/null degrade
// to undefined (the engine flattens what it gets). A runtime guard, not a cast.
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

function asBehavior(value: unknown): IKeyboardAvoidingBehavior | undefined {
  return value === 'height' || value === 'position' || value === 'padding' ? value : undefined;
}

// The prop/handler keys the lifecycle consumes itself; everything else (accessibility, testID,
// aria-*/data-*) forwards onto the wrapper host node.
const HANDLED_ATTRS = [
  'behavior',
  'enabled',
  'keyboardVerticalOffset',
  'contentContainerStyle',
  'style',
  'onLayout',
];

// The forwarded bag carries the aria/role aliases, so it is typed as the a11y intersection (a
// genuine narrowing: the accumulator is BUILT at that type, not cast) so resolveAccessibilityProps
// folds aria-* into accessibility* before it reaches the wrapper host, exactly as React's View does.
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export type { IKeyboardAvoidingBehavior } from '@symbiote/components';

export const KeyboardAvoidingView = defineComponent<
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingViewEmits
>(
  (_props, { attrs: rawAttrs, slots, emit }) => {
    // The inset is a number (plain data), so a plain ref is correct; no engine node is held here
    // (onLayout delivers the frame, so no imperative measure / host-node capture is needed).
    const inset = ref(0);
    // Mutable, not reactive: changing the measured frame alone shouldn't re-render; it feeds the
    // next keyboard event's inset math (React's frameRef / initialHeightRef).
    let frame: IMeasuredFrame | undefined;
    let initialHeight: number | undefined;

    const verticalOffset = (): number =>
      typeof rawAttrs.keyboardVerticalOffset === 'number'
        ? rawAttrs.keyboardVerticalOffset
        : DEFAULT_VERTICAL_OFFSET;

    const onShow = (payload: unknown): void => {
      const keyboard = readKeyboardFrame(payload);
      const next = computeInset(frame, keyboard, verticalOffset());
      dlog(`KeyboardAvoidingView show -> inset ${next}`);
      inset.value = next;
    };
    const onHide = (): void => {
      dlog('KeyboardAvoidingView hide -> inset 0');
      inset.value = 0;
    };

    let subscriptions: IEventSubscription[] = [];
    onMounted(() => {
      subscriptions = [
        Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
        Keyboard.addListener(KEYBOARD_EVENT.didChangeFrame, onShow),
        Keyboard.addListener(KEYBOARD_EVENT.didHide, onHide),
      ];
    });
    onUnmounted(() => {
      for (const subscription of subscriptions) subscription.remove();
      subscriptions = [];
    });

    const handleLayout = (event: ISymbioteEvent): void => {
      const measured = readLayoutFrame(event.nativeEvent.layout);
      if (measured !== undefined) {
        frame = measured;
        if (initialHeight === undefined) initialHeight = measured.height;
      }
      emit('layout', event);
    };

    return (): VNode => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const behavior = asBehavior(attrs.behavior);
      // RN gates every inset on `enabled ?? true`; only an explicit `false` disables.
      const isEnabled = attrs.enabled !== false;
      const effectiveInset = isEnabled ? inset.value : 0;

      const layout = resolveKeyboardAvoidingLayout({
        behavior,
        effectiveInset,
        initialHeight,
        style: isStyleProp(attrs.style) ? attrs.style : undefined,
        contentContainerStyle: isStyleProp(attrs.contentContainerStyle)
          ? attrs.contentContainerStyle
          : undefined,
      });

      const childNodes = slots.default !== undefined ? slots.default() : undefined;
      const wrapperProps = {
        ...resolveAccessibilityProps(forwardAttrs(attrs)),
        style: layout.wrapperStyle,
        onLayout: handleLayout,
      };

      // 'nested' ('position') pushes the children in an inner view by `bottom: inset`; the wrapper
      // modes adjust the single wrapper directly.
      if (layout.kind === 'nested') {
        return h('symbiote-view', wrapperProps, [
          h('symbiote-view', { style: layout.innerStyle }, childNodes),
        ]);
      }
      return h('symbiote-view', wrapperProps, childNodes);
    };
  },
  {
    name: 'KeyboardAvoidingView',
    inheritAttrs: false,
    emits: {
      layout: (_event: ISymbioteEvent): boolean => true,
    },
  },
);
