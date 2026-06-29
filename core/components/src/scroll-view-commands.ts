// ScrollView: the imperative + style-routing module (framework-agnostic, no 3-layer split:
// ScrollView has no state machine). The imperative handle, the layout/visual style split for
// the Android RefreshControl wrap, the scroll-event guard/forwarder, and the native sticky
// scroll-attach are all platform- and framework-invariant, so they live here. The adapter
// supplies the lifecycle (the node getter, the effect) and re-exports these.

import {
  attachNativeEvent,
  dispatchViewCommand,
  dlog,
  flattenStyle,
  type AnimatedValue,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote/engine';

type IScrollHandler = (event: ISymbioteEvent) => void;

// The imperative API RN exposes on a ScrollView ref. Each method drives a native
// view command on the scroll-view node (RN ScrollViewCommands): scrollTo carries
// [x, y, animated], scrollToEnd [animated], flashScrollIndicators no args. The
// platform files wrap the component in forwardRef and back this with the scroll node.
export interface IScrollViewHandle {
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  flashScrollIndicators(): void;
  // The raw scroll SymbioteNode behind this handle (RN's getScrollableNode). The
  // imperative handle is what a ref captures, so Animated needs this seam to reach the
  // node that fires native scroll events; see createAnimatedComponent's event attach.
  getScrollNode(): ISymbioteNode | null;
}

// RN's splitLayoutProps key partition (StyleSheet/splitLayoutProps.js): the LAYOUT keys
// that belong on the OUTER box when a layout-affecting wrapper sits between the laid-out
// frame and the visual content. Everything NOT in this set (background*, padding*, border*,
// opacity, overflow, …) is VISUAL and stays on the inner view. Replicated exactly from RN's
// switch cases so the Android RefreshControl wrap routes style the way RN does.
const LAYOUT_KEYS: ReadonlySet<string> = new Set([
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginBottom',
  'marginTop',
  'marginLeft',
  'marginRight',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'height',
  'minHeight',
  'maxHeight',
  'width',
  'minWidth',
  'maxWidth',
  'position',
  'left',
  'right',
  'bottom',
  'top',
  'transform',
  'transformOrigin',
  'rowGap',
  'columnGap',
  'gap',
]);

// Split a flattened style into the LAYOUT props that drive the outer wrapper's frame and the
// VISUAL props that paint the inner content, RN's splitLayoutProps. The Android build uses
// this when a RefreshControl wraps the scroll view: layout (margin/flex/size/position/…) goes
// on the AndroidSwipeRefreshLayout wrapper, visual (background/padding/border/…) stays on the
// inner scroll view, instead of dumping the whole style on the wrapper and hardcoding flex:1.
export function splitLayoutProps(style: IStyleProp<IViewStyle> | undefined): {
  outer: Record<string, unknown>;
  inner: Record<string, unknown>;
} {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  // Reads keys off the style, so flatten the StyleProp (array/nested) to one object first.
  const flat = flattenStyle(style);
  for (const key of Object.keys(flat)) {
    const value = Reflect.get(flat, key);
    if (LAYOUT_KEYS.has(key)) outer[key] = value;
    else inner[key] = value;
  }
  return { outer, inner };
}

export function isSymbioteEvent(value: unknown): value is ISymbioteEvent {
  if (typeof value !== 'object' || value === null) return false;
  const nativeEvent = Reflect.get(value, 'nativeEvent');
  return typeof nativeEvent === 'object' && nativeEvent !== null;
}

// Forward a wrapped scroll event to the user's ScrollHandler. The Animated.event listener
// hands raw args; the first is the original SymbioteEvent, which we narrow with a runtime
// guard (no cast) and pass through unchanged so the user sees the same event RN would deliver.
export function forwardScrollEvent(handler: IScrollHandler, args: readonly unknown[]): void {
  const first = args[0];
  if (isSymbioteEvent(first)) handler(first);
}

// The imperative handle is identical across platforms: every method dispatches a view
// command on the SAME scroll-view node; only the surrounding element assembly diverges
// (iOS sibling RefreshControl vs Android wrap). So it is built once here and both platform
// files back it with their scroll node getter. Commands and arg order mirror RN's
// ScrollViewCommands: scrollTo [x, y, animated], scrollToEnd [animated], flashScrollIndicators [].
//
// `getNode` is a LAZY getter (React `() => ref.current`, Vue `() => nodeRef.value`), read on
// every call, NOT the node captured once. The node is null at mount and only set after the
// element commits, so an eager capture would freeze `null` and every command would no-op.
export function buildScrollViewHandle(getNode: () => ISymbioteNode | null): IScrollViewHandle {
  return {
    scrollTo: (options): void => {
      const node = getNode();
      if (node === null) return;
      const x = options?.x ?? 0;
      const y = options?.y ?? 0;
      const animated = options?.animated ?? true;
      dlog(`ScrollView.scrollTo x=${x} y=${y} animated=${animated}`);
      dispatchViewCommand(node, 'scrollTo', [x, y, animated]);
    },
    scrollToEnd: (options): void => {
      const node = getNode();
      if (node === null) return;
      const animated = options?.animated ?? true;
      dlog(`ScrollView.scrollToEnd animated=${animated}`);
      dispatchViewCommand(node, 'scrollToEnd', [animated]);
    },
    flashScrollIndicators: (): void => {
      const node = getNode();
      if (node === null) return;
      dlog('ScrollView.flashScrollIndicators');
      dispatchViewCommand(node, 'flashScrollIndicators', []);
    },
    getScrollNode: (): ISymbioteNode | null => getNode(),
  };
}

// Attach the scroll event to the scroll-offset value on the NATIVE driver, RN's
// _updateAnimatedNodeAttachment / AnimatedImplementation.attachNativeEvent (ScrollView.js:1087).
// The value then tracks scroll on the UI thread and the sticky-header interpolations ride it
// natively (no JS jitter). Returns the detach function the adapter's effect calls on cleanup.
export function attachStickyScroll(node: ISymbioteNode, value: AnimatedValue): () => void {
  const attachment = attachNativeEvent(node, 'onScroll', [
    { nativeEvent: { contentOffset: { y: value } } },
  ]);
  return () => attachment.detach();
}
