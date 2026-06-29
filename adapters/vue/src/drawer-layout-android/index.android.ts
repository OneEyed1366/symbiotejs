// DrawerLayoutAndroid on Android: the real build, the Vue twin of the React adapter's
// index.android.ts. AndroidDrawerLayout is an ordinary Fabric host node committing through the same
// childSet as the rest of the tree (no per-library glue; shared derives the view's events from its
// ViewConfig, so we render the RAW Fabric name 'AndroidDrawerLayout'). The platform-invariant math —
// the host prop bag + the content/navigation wrapper styles, the slide/state event normalization,
// the imperative open/close handle, and the view/command NAMES — lives in @symbiote/components,
// shared verbatim with React; here Vue supplies only the lifecycle: a shallowRef holds the host node
// (so the engine's mirror resolves it for the imperative commands), a `drawerOpened` ref gates the
// navigation wrapper's pointerEvents, and expose() wires the imperative handle.
//
// Child order matches RN exactly: content FIRST, navigation SECOND ({childrenWrapper}{drawerViewWrapper}).
// Content is the DEFAULT slot; the drawer is the `navigationView` slot (the Vue twin of React's
// children / renderNavigationView). Inputs arrive as attrs (untyped), each narrowed with a runtime
// guard rather than a cast. The onDrawer* handlers are wrapped (drawerOpened + normalization), so they
// are stripped from the forwarded attrs; everything else (testID / accessibility / aria-*) folds via
// resolveAccessibilityProps onto the host. Metro picks this file on an Android host; no Platform.OS read.
// device-verify-pending: the AndroidDrawerLayout name + openDrawer/closeDrawer commands are
// RN-source-confirmed, not yet exercised on a real Android host.

import { defineComponent, h, ref, shallowRef, type SetupContext } from '@vue/runtime-core';
import {
  buildDrawerHandle,
  offsetFromSlide,
  resolveAccessibilityProps,
  resolveDrawerLayout,
  stateFromChange,
  type IAccessibilityProps,
  type IAriaProps,
  type IDrawerLockMode,
  type IDrawerPosition,
  type IKeyboardDismissMode,
} from '@symbiote/components';
import {
  dlog,
  isSymbioteNode,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote/engine';
import { View } from '../components';
import { normalizeVueAttrs } from '../normalize-attrs';

export type {
  IDrawerPosition,
  IDrawerLockMode,
  IKeyboardDismissMode,
  IDrawerState,
  IDrawerSlideEvent,
  IDrawerLayoutAndroidProps,
  IDrawerLayoutAndroidHandle,
} from './shared';

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asDrawerPosition(value: unknown): IDrawerPosition | undefined {
  return value === 'left' || value === 'right' ? value : undefined;
}

function asDrawerLockMode(value: unknown): IDrawerLockMode | undefined {
  return value === 'unlocked' || value === 'locked-closed' || value === 'locked-open'
    ? value
    : undefined;
}

function asKeyboardDismissMode(value: unknown): IKeyboardDismissMode | undefined {
  return value === 'none' || value === 'on-drag' ? value : undefined;
}

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

// The typed fields the lifecycle consumes/re-emits (resolveDrawerLayout folds the drawer* props onto
// the host) and the onDrawer* handlers (wrapped here, never forwarded raw); everything else (testID,
// accessibility, aria-*) forwards onto the host via passthrough.
const HANDLED_ATTRS = [
  'drawerWidth',
  'drawerPosition',
  'drawerLockMode',
  'keyboardDismissMode',
  'drawerBackgroundColor',
  'statusBarBackgroundColor',
  'style',
  'onDrawerOpen',
  'onDrawerClose',
  'onDrawerSlide',
  'onDrawerStateChanged',
];

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export const DrawerLayoutAndroid = defineComponent({
  name: 'DrawerLayoutAndroid',
  inheritAttrs: false,
  setup(_props, { slots, attrs: rawAttrs, expose }: SetupContext) {
    // shallowRef, NOT ref: the engine node must be held by IDENTITY. A plain ref() runs the node
    // through Vue's toReactive(), handing back a reactive Proxy the engine's mirror (a WeakMap keyed
    // on the raw node) can't resolve, so openDrawer/closeDrawer would silently no-op. Same rule as
    // the Switch / ScrollView host node (see .claude/skills/vue-adapter-reactivity).
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNodeRef = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };

    // drawerOpened gates the navigation wrapper's pointerEvents (RN _onDrawerOpen/_onDrawerClose
    // setState): closed -> 'none' so the off-screen drawer never intercepts touches. A plain ref is
    // fine here — it holds a boolean, not an engine node; the shallowRef rule is only for the node.
    const drawerOpened = ref(false);

    // The imperative handle reads the node through a LAZY getter (() => nodeRef.value), not the node
    // captured once: it is null until the element commits. expose() makes it the value a parent ref
    // sees — the Vue twin of React's useImperativeHandle(ref, buildDrawerHandle(…)).
    expose(buildDrawerHandle(() => nodeRef.value));

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);

      const onDrawerOpenUser = isHandler(attrs.onDrawerOpen) ? attrs.onDrawerOpen : undefined;
      const onDrawerCloseUser = isHandler(attrs.onDrawerClose) ? attrs.onDrawerClose : undefined;
      const onDrawerSlideUser = isHandler(attrs.onDrawerSlide) ? attrs.onDrawerSlide : undefined;
      const onDrawerStateChangedUser = isHandler(attrs.onDrawerStateChanged)
        ? attrs.onDrawerStateChanged
        : undefined;

      const handleDrawerOpen = (): void => {
        dlog('Vue DrawerLayoutAndroid onDrawerOpen');
        drawerOpened.value = true;
        onDrawerOpenUser?.();
      };
      const handleDrawerClose = (): void => {
        dlog('Vue DrawerLayoutAndroid onDrawerClose');
        drawerOpened.value = false;
        onDrawerCloseUser?.();
      };
      const handleDrawerSlide = (event: ISymbioteEvent): void => {
        dlog('Vue DrawerLayoutAndroid onDrawerSlide');
        onDrawerSlideUser?.({ offset: offsetFromSlide(event) });
      };
      const handleDrawerStateChanged = (event: ISymbioteEvent): void => {
        onDrawerStateChangedUser?.(stateFromChange(event));
      };

      const resolved = resolveDrawerLayout({
        drawerWidth: asNumber(attrs.drawerWidth),
        drawerPosition: asDrawerPosition(attrs.drawerPosition),
        drawerLockMode: asDrawerLockMode(attrs.drawerLockMode),
        keyboardDismissMode: asKeyboardDismissMode(attrs.keyboardDismissMode),
        drawerBackgroundColor: asString(attrs.drawerBackgroundColor),
        statusBarBackgroundColor: asString(attrs.statusBarBackgroundColor),
        drawerOpened: drawerOpened.value,
        style: isStyleProp(attrs.style) ? attrs.style : undefined,
        passthrough: resolveAccessibilityProps(forwardAttrs(attrs)),
      });

      // RN's mainSubview: content wrapped in an absolute full-screen box (the default slot).
      const content = h(
        View,
        { style: resolved.contentWrapperStyle },
        slots.default !== undefined ? slots.default() : [],
      );
      // RN's drawerSubview: the navigation view (the `navigationView` slot) wrapped, drawerWidth-wide,
      // painted with drawerBackgroundColor, untouchable until opened.
      const navigation = h(
        View,
        {
          style: resolved.navigationWrapperStyle,
          pointerEvents: resolved.navigationPointerEvents,
        },
        slots.navigationView !== undefined ? slots.navigationView() : [],
      );

      dlog(
        `Vue DrawerLayoutAndroid render width=${String(asNumber(attrs.drawerWidth))} ` +
          `opened=${drawerOpened.value}`,
      );

      // Child order matches RN exactly: content FIRST, navigation SECOND.
      return h(
        resolved.viewName,
        {
          ...resolved.hostProps,
          ref: setNodeRef,
          onDrawerOpen: handleDrawerOpen,
          onDrawerClose: handleDrawerClose,
          onDrawerSlide: handleDrawerSlide,
          onDrawerStateChanged: handleDrawerStateChanged,
        },
        [content, navigation],
      );
    };
  },
});
