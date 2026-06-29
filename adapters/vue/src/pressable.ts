// Pressable, the Vue lifecycle half. The press lifecycle (the long-press timer, unstable_press-
// Delay deferral, the pressRetentionOffset drift test, the suppression flags) lives in
// @symbiote/components/state as a pure machine over a runtime + host; the render decisions (the
// responder listeners, the disabled→accessibilityState fold, the ripple prop) in
// @symbiote/components/view, both shared verbatim with the React adapter. Here Vue supplies the
// reactivity: a `ref` holds `pressed`, a setup-scope object holds the press runtime, a function
// ref grabs the responder View's host node, and the machine measures through it. This is the Vue
// twin of the React adapter's useState + useRef(runtime) + useRef(viewRef).
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard rather than a cast.
// The user's onPress / onPressIn / … are consumed by the machine and MUST be stripped from the
// forwarded attrs (they are pure-JS callbacks; the machine's SYNTHESIZED handlers go on the View,
// where routeProp turns press/pressIn/pressOut + the responder events into listeners). Children
// arrive as a (scoped) default slot so `v-slot="{ pressed }"` mirrors React's children-as-function.

import {
  defineComponent,
  h,
  ref,
  shallowRef,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  createPressHandlers,
  createPressRuntime,
  rippleProps,
  buildPressableListeners,
  resolveDisabledAccessibilityState,
  noteHoverNoop,
  resolveAccessibilityProps,
  DEFAULT_DELAY_LONG_PRESS_MS,
  type IPressHost,
  type IPressState,
  type IPressHandler,
  type IRectOffset,
  type IPressMachineConfig,
  type IPressableAndroidRippleConfig,
  type IAccessibilityProps,
  type IAriaProps,
  type IAccessibilityStateValue,
} from '@symbiote/components';
import {
  measure,
  isSymbioteNode,
  type ISymbioteNode,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote/engine';
import { View } from './components';
import { normalizeVueAttrs } from './normalize-attrs';

export type { IPressState, IPressableAndroidRippleConfig } from '@symbiote/components';

// The Vue-facing prop surface (mirrors React's IPressableProps minus children, which Vue takes via
// a scoped slot). style may be a plain style or a function of the press state, exactly as React.
export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  pressRetentionOffset?: IRectOffset;
  unstable_pressDelay?: number;
  android_ripple?: IPressableAndroidRippleConfig;
  android_disableSound?: boolean;
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  testID?: string;
  style?: IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPressHandler(value: unknown): value is IPressHandler {
  return typeof value === 'function';
}

function isStyleFn(value: unknown): value is (state: IPressState) => IStyleProp<IViewStyle> {
  return typeof value === 'function';
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// A scalar offset, or the per-edge object; anything else is dropped (the machine reads undefined
// as "no offset" → RN's defaults).
function asRectOffset(value: unknown): IRectOffset | undefined {
  if (typeof value === 'number') return value;
  if (!isRecord(value)) return undefined;
  const rect: { top?: number; left?: number; bottom?: number; right?: number } = {};
  if (typeof value.top === 'number') rect.top = value.top;
  if (typeof value.left === 'number') rect.left = value.left;
  if (typeof value.bottom === 'number') rect.bottom = value.bottom;
  if (typeof value.right === 'number') rect.right = value.right;
  return rect;
}

// android_ripple arrives untyped; keep only the fields the shared rippleProps reads.
function asRippleConfig(value: unknown): IPressableAndroidRippleConfig | undefined {
  if (!isRecord(value)) return undefined;
  const config: IPressableAndroidRippleConfig = {};
  if (typeof value.color === 'string') config.color = value.color;
  if (typeof value.borderless === 'boolean') config.borderless = value.borderless;
  if (typeof value.radius === 'number') config.radius = value.radius;
  if (typeof value.foreground === 'boolean') config.foreground = value.foreground;
  return config;
}

// The user's accessibilityState, narrowed to the known fields (the disabled merge happens after).
function asAccessibilityState(value: unknown): IAccessibilityStateValue | undefined {
  if (!isRecord(value)) return undefined;
  const state: IAccessibilityStateValue = {};
  if (typeof value.disabled === 'boolean') state.disabled = value.disabled;
  if (typeof value.selected === 'boolean') state.selected = value.selected;
  if (value.checked === 'mixed' || typeof value.checked === 'boolean')
    state.checked = value.checked;
  if (typeof value.busy === 'boolean') state.busy = value.busy;
  if (typeof value.expanded === 'boolean') state.expanded = value.expanded;
  return state;
}

function resolveStyle(value: unknown, state: IPressState): unknown {
  if (isStyleFn(value)) return value(state);
  return value;
}

// The prop/handler keys the lifecycle consumes itself; everything else (aria/accessibility/
// testID/nativeID/native props) forwards onto the View. The user press callbacks are pure JS and
// must never reach the host; the machine's synthesized handlers go on via buildPressableListeners.
const HANDLED_ATTRS = [
  'onPress',
  'onPressIn',
  'onPressOut',
  'onPressMove',
  'onLongPress',
  'delayLongPress',
  'disabled',
  'cancelable',
  'pressRetentionOffset',
  'unstable_pressDelay',
  'android_ripple',
  'android_disableSound',
  'onHoverIn',
  'onHoverOut',
  'delayHoverIn',
  'delayHoverOut',
  'style',
  'accessibilityState',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export const Pressable = defineComponent({
  name: 'Pressable',
  inheritAttrs: false,
  setup(_props, { slots, attrs: rawAttrs }: SetupContext) {
    const pressed = ref(false);
    // The mutable press runtime (timers, suppression flags, measured region). A plain setup-scope
    // object, never a ref: it is mutated by the machine, never reactively read.
    const runtime = createPressRuntime();
    // shallowRef, NOT ref: the engine node is held by IDENTITY so measure() hits the engine's
    // WeakMap mirror (a plain ref would wrap it in a reactive Proxy → mirror miss → measure no-op).
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNodeRef = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };

    // The lifecycle seam the machine fills: flip the reactive `pressed`, and expose the responder
    // View's raw frame-measure (or undefined before the node commits → radius fallback).
    const host: IPressHost = {
      setPressed: next => {
        pressed.value = next;
      },
      getMeasureFn: () => {
        const node = nodeRef.value;
        if (node === null) return undefined;
        return callback => measure(node, callback);
      },
      schedule: (callback, ms) => {
        const id = setTimeout(callback, ms);
        return () => clearTimeout(id);
      },
    };

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const disabled = attrs.disabled === true ? true : undefined;
      const cancelable = typeof attrs.cancelable === 'boolean' ? attrs.cancelable : undefined;

      const config: IPressMachineConfig = {
        onPress: isPressHandler(attrs.onPress) ? attrs.onPress : undefined,
        onPressIn: isPressHandler(attrs.onPressIn) ? attrs.onPressIn : undefined,
        onPressOut: isPressHandler(attrs.onPressOut) ? attrs.onPressOut : undefined,
        onPressMove: isPressHandler(attrs.onPressMove) ? attrs.onPressMove : undefined,
        onLongPress: isPressHandler(attrs.onLongPress) ? attrs.onLongPress : undefined,
        delayLongPress: numberOr(attrs.delayLongPress, DEFAULT_DELAY_LONG_PRESS_MS),
        unstable_pressDelay: numberOr(attrs.unstable_pressDelay, 0),
        hitSlop: asRectOffset(attrs.hitSlop),
        pressRetentionOffset: asRectOffset(attrs.pressRetentionOffset),
      };
      const handlers = createPressHandlers(config, runtime, host);

      noteHoverNoop(attrs.onHoverIn, attrs.onHoverOut);

      const state: IPressState = { pressed: pressed.value };

      // Fold the disabled state into the user's accessibilityState, then fold aria/role over the
      // forwarded attrs (the Vue View is a bare host primitive, so Pressable folds; React's View
      // folds for it). resolveAccessibilityProps merges aria into the accessibilityState we set.
      const forwarded = forwardAttrs(attrs);
      forwarded.accessibilityState = resolveDisabledAccessibilityState(
        asAccessibilityState(attrs.accessibilityState),
        disabled,
      );
      const folded = resolveAccessibilityProps(forwarded);

      const viewProps: Record<string, unknown> = {
        ...folded,
        ref: setNodeRef,
        style: resolveStyle(attrs.style, state),
      };
      if (typeof attrs.android_disableSound === 'boolean')
        viewProps.android_disableSound = attrs.android_disableSound;
      Object.assign(viewProps, buildPressableListeners(handlers, { disabled, cancelable }));

      // Children come from the (scoped) default slot, receiving the press state so a render-prop
      // child (`v-slot="{ pressed }"`) mirrors React's children-as-function.
      const content: VNode[] = slots.default !== undefined ? slots.default(state) : [];

      // android_ripple rides a dedicated inner View; on iOS the prop is undefined, so the child
      // renders unwrapped, no extra node. Mirrors the React Pressable + touchable-native-feedback.
      const ripple = isRecord(attrs.android_ripple)
        ? rippleProps(asRippleConfig(attrs.android_ripple) ?? {})
        : undefined;
      const inner = ripple !== undefined ? [h(View, ripple, () => content)] : content;

      // Children go to the host View as a FUNCTION slot, never a raw array: View is a
      // functional component, and an array child makes Vue normalize it to a default
      // slot with a dev warn ("Prefer function slots"). Benign under SFC, but in JSX the
      // warn's trace formats the __self/__source dev props (native HostObjects) and that
      // read throws, unwinding the whole mount → blank screen. A function slot skips it.
      return h(View, viewProps, () => inner);
    };
  },
});
