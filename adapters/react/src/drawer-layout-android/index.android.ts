// DrawerLayoutAndroid: the real Android build. AndroidDrawerLayout is an ordinary
// Fabric host node: it lives in the SAME childSet and commits through the SAME
// completeRoot as the rest of the tree, exactly like Modal/Switch. There is no
// per-library glue; shared derives the view's events/processors from its ViewConfig,
// so we render the RAW Fabric name `AndroidDrawerLayout` (the derive-by-default path:
// any non-`symbiote-*` createElement type flows through untouched).
//
// Behavior mirrors RN's DrawerLayoutAndroid.android.js: the navigation view (from
// `renderNavigationView()`) and the main content are wrapped in two container Views,
// and, critically, the child order RN commits is [mainSubview, drawerSubview]: the
// content wrapper FIRST, the navigation wrapper SECOND (android render:
// {childrenWrapper}{drawerViewWrapper}). The navigation wrapper is absolutely
// positioned, drawerWidth-wide, and gated by pointerEvents so it stays untouchable
// until opened. `openDrawer`/`closeDrawer` are imperative, reached through a ref, and
// dispatched as the `openDrawer`/`closeDrawer` view commands against the host node,
// mirroring Switch's dispatchViewCommand path (Commands.openDrawer/closeDrawer in
// AndroidDrawerLayoutNativeComponent).
//
// The platform-invariant math — the host prop bag + the content/navigation wrapper styles, the
// slide/state event normalization, the imperative open/close handle, and the view/command NAMES —
// lives in @symbiote/components, shared verbatim with the Vue adapter; here React supplies only the
// lifecycle: a ref holds the host node, a `drawerOpened` state gates the navigation wrapper's
// pointerEvents, and useImperativeHandle wires the imperative handle.
//
// Metro picks this file on an Android host; off Android the base index.ts
// renders the fallback. No Platform.OS read; the filename is the selector (ADR 0019).
// device-verify-pending: the `AndroidDrawerLayout` name + the openDrawer/closeDrawer
// commands are RN-source-confirmed, not yet exercised on a real Android host.

import {
  createElement,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { dlog, type ISymbioteEvent, type ISymbioteNode } from '@symbiote/engine';
import {
  buildDrawerHandle,
  DEFAULT_DRAWER_POSITION,
  offsetFromSlide,
  resolveAccessibilityProps,
  resolveDrawerLayout,
  stateFromChange,
} from '@symbiote/components';
import { View } from '../components';
import type { IDrawerLayoutAndroidHandle, IDrawerLayoutAndroidProps } from './shared';

export type {
  IDrawerPosition,
  IDrawerLockMode,
  IKeyboardDismissMode,
  IDrawerState,
  IDrawerSlideEvent,
  IDrawerLayoutAndroidProps,
  IDrawerLayoutAndroidHandle,
} from './shared';

export const DrawerLayoutAndroid = forwardRef<
  IDrawerLayoutAndroidHandle,
  IDrawerLayoutAndroidProps
>((props, ref) => {
  const {
    drawerWidth,
    drawerPosition,
    drawerLockMode,
    keyboardDismissMode,
    drawerBackgroundColor,
    statusBarBackgroundColor,
    onDrawerOpen,
    onDrawerClose,
    onDrawerSlide,
    onDrawerStateChanged,
    renderNavigationView,
    style,
    children,
    ...passthrough
  } = props;

  const node = useRef<ISymbioteNode | null>(null);
  // RN tracks drawerOpened to gate the navigation view's pointerEvents (android
  // _onDrawerOpen/_onDrawerClose setState). Closed -> 'none' so the off-screen drawer
  // never intercepts touches; open -> 'auto' (folded in by resolveDrawerLayout).
  const [drawerOpened, setDrawerOpened] = useState(false);

  // The imperative handle reads the node through a LAZY getter (() => node.current), not the node
  // captured once: it is null until the element commits. The React twin of Vue's
  // expose(buildDrawerHandle(…)).
  useImperativeHandle(ref, () => buildDrawerHandle(() => node.current), []);

  const handleDrawerOpen = useCallback((): void => {
    dlog('DrawerLayoutAndroid onDrawerOpen');
    setDrawerOpened(true);
    onDrawerOpen?.();
  }, [onDrawerOpen]);

  const handleDrawerClose = useCallback((): void => {
    dlog('DrawerLayoutAndroid onDrawerClose');
    setDrawerOpened(false);
    onDrawerClose?.();
  }, [onDrawerClose]);

  const handleDrawerSlide = useCallback(
    (event: ISymbioteEvent): void => {
      onDrawerSlide?.({ offset: offsetFromSlide(event) });
    },
    [onDrawerSlide],
  );

  const handleDrawerStateChanged = useCallback(
    (event: ISymbioteEvent): void => {
      onDrawerStateChanged?.(stateFromChange(event));
    },
    [onDrawerStateChanged],
  );

  const resolved = resolveDrawerLayout({
    drawerWidth,
    drawerPosition,
    drawerLockMode,
    keyboardDismissMode,
    drawerBackgroundColor,
    statusBarBackgroundColor,
    drawerOpened,
    style,
    // The drawer renders a raw host node (not the View FC), so unlike View-backed components nothing
    // else resolves aria-*/role — fold them into accessibility* here before passing through.
    passthrough: resolveAccessibilityProps(passthrough),
  });

  // RN's mainSubview: content wrapped in an absolute box.
  const contentWrapper = createElement(View, { style: resolved.contentWrapperStyle }, children);

  // RN's drawerSubview: the navigation view wrapped, drawerWidth-wide, painted with
  // drawerBackgroundColor, untouchable until opened.
  const navigationWrapper = createElement(
    View,
    {
      style: resolved.navigationWrapperStyle,
      pointerEvents: resolved.navigationPointerEvents,
    },
    renderNavigationView(),
  );

  dlog(
    `DrawerLayoutAndroid render position=${drawerPosition ?? DEFAULT_DRAWER_POSITION} ` +
      `width=${String(drawerWidth)} opened=${drawerOpened}`,
  );

  // Child order matches RN exactly: content FIRST, navigation SECOND
  // (android render emits {childrenWrapper}{drawerViewWrapper}).
  return createElement(
    resolved.viewName,
    {
      ...resolved.hostProps,
      ref: node,
      onDrawerOpen: handleDrawerOpen,
      onDrawerClose: handleDrawerClose,
      onDrawerSlide: handleDrawerSlide,
      onDrawerStateChanged: handleDrawerStateChanged,
    },
    contentWrapper,
    navigationWrapper,
  );
});
