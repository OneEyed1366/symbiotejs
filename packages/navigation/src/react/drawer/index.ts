// Drawer, the React lifecycle half. The open/closed + focused-route router (drawer-router-state)
// and the pure swipe/geometry math (drawer-options) live in @symbiote-native/navigation core,
// shared verbatim with the Vue/Angular adapters; here React supplies the lifecycle - useReducer
// for the router, a PanResponder for the swipe gesture (RN's own idiom: build it ONCE via
// useRef, let its callbacks read current values off refs rather than rebuilding it every render),
// an Animated.Value driving the slide/opacity transforms, and useImperativeHandle for the
// open/close/toggle/jumpTo handle - mirroring react/tabs.ts's shape (Tab is the closer sibling:
// both are fixed-route-list, no-react-native-screens navigators; Stack's push/pop + native-screen
// bridging don't apply here).
//
// FEASIBILITY NOTE (see the drawer skill / PR description for the full writeup): the REAL
// @react-navigation/drawer is built on react-native-gesture-handler + react-native-reanimated,
// neither of which this codebase depends on. What's built here reaches the same swipe-to-open/
// close + front/back/slide/permanent behavior using only PanResponder + Animated (both already in
// @symbiote-native/engine), which is sufficient for a solid drawer but NOT byte-for-byte parity -
// see the explicit gap list at the bottom of this file.

import {
  createElement,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Animated, PanResponder, useWindowDimensions } from '@symbiote-native/react';
import type { IPanResponderGestureState, ISymbioteEvent } from '@symbiote-native/react';
import type { IDescriptor } from '@symbiote-native/components';
import { dlog, type IStyleProp, type IViewStyle } from '@symbiote-native/engine';
import {
  DRAWER_DEFAULT_OVERLAY_COLOR,
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createInitialDrawerRouterState,
  createNavigationEmitter,
  drawerChildOrder,
  drawerRouterReducer,
  isDrawerAnimated,
  renderDrawer,
  resolveDragProgress,
  resolveDrawerGeometry,
  resolveDrawerSlotInterpolation,
  resolveSwipeIntent,
  shouldClaimDrawerSwipe,
} from '../../core';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IDrawerOptions,
  IDrawerRouterState,
  IDrawerScreenOptions,
  IDrawerSlot,
  IRoute,
} from '../../core';
import { collectRegistry } from '../collect-registry';
import { NavigationContext } from '../navigation-context';
import { DrawerScreen } from '../drawer-screen';
import type { IDrawerScreenOptionsArgs, IDrawerScreenProps } from '../drawer-screen';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  screenOptions?: IDrawerScreenOptions;
  drawerStyle?: IStyleProp<IViewStyle>;
  renderDrawerContent?: (props: {
    state: IDrawerRouterState;
    descriptors: IDrawerDescriptorMap;
    navigation: IDrawerNavigatorHandle;
  }) => ReactNode;
  children?: ReactNode;
};

type IDrawerRegistryEntry = Omit<IDrawerScreenProps, 'name'>;

function isDrawerScreenElement(child: ReactNode): child is ReactElement<IDrawerScreenProps> {
  return isValidElement(child) && child.type === DrawerScreen;
}

function resolveDrawerScreenOptions(
  entry: IDrawerRegistryEntry,
  optionsArgs: IDrawerScreenOptionsArgs,
  screenOptions: IDrawerScreenOptions | undefined,
): IDrawerScreenOptions {
  const own = typeof entry.options === 'function' ? entry.options(optionsArgs) : entry.options;
  return { ...screenOptions, ...own };
}

const DRAWER_SNAP_DURATION = 250;

const DrawerImpl = forwardRef<IDrawerNavigatorHandle, IDrawerProps>((props, forwardedRef) => {
  // Read BEFORE establishing this Drawer's own Context value below - becomes the `parent` link a
  // nested screen's useNavigation().getParent() walks (e.g. this Drawer rendered as a Stack
  // screen's content reaches that Stack via this value). undefined when this Drawer is the
  // nesting root.
  const ambientContext = useContext(NavigationContext);
  const {
    initialRouteName,
    screenOptions,
    renderDrawerContent,
    children,
    drawerStyle,
    drawerType,
    drawerPosition,
    drawerWidth,
    overlayColor,
    swipeEnabled,
    swipeEdgeWidth,
    swipeMinDistance,
    swipeMinVelocity,
  } = props;

  const options: IDrawerOptions = {
    drawerType,
    drawerPosition,
    drawerWidth,
    overlayColor,
    swipeEnabled,
    swipeEdgeWidth,
    swipeMinDistance,
    swipeMinVelocity,
  };

  const registry = useMemo(() => collectRegistry(children, isDrawerScreenElement), [children]);
  const routeIdPrefix = useId();

  const routes = useMemo<IRoute<unknown>[]>(
    () =>
      Array.from(registry.entries()).map(([name, entry]) => ({
        key: `${routeIdPrefix}-${name}`,
        name,
        params: entry.initialParams,
      })),
    [registry, routeIdPrefix],
  );

  const [state, dispatch] = useReducer(drawerRouterReducer, undefined, () =>
    createInitialDrawerRouterState(routes, initialRouteName),
  );

  if (routes.length === 0) dlog('Drawer: no <Drawer.Screen> children registered');

  const { width: screenWidth } = useWindowDimensions();

  // progress: 0 closed -> 1 open, the single Animated.Value every slide/opacity transform below
  // interpolates from.
  const progress = useRef(new Animated.Value(state.isOpen ? 1 : 0)).current;
  // Where a drag STARTS from, in progress units. Always exactly 0 or 1: a gesture only ever
  // begins at rest, since terminate/release always snap the value back to a resting state before
  // another grant can fire.
  const dragStartProgress = useRef(0);

  // Refs so the PanResponder's callbacks - built ONCE below, RN's own idiom - always read the
  // CURRENT render's values without forcing a new PanResponder identity on every state/prop
  // change (recreating panHandlers mid-gesture would drop the in-flight touch).
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const screenWidthRef = useRef(screenWidth);
  screenWidthRef.current = screenWidth;
  const isOpenRef = useRef(state.isOpen);
  isOpenRef.current = state.isOpen;

  const animateProgressTo = useCallback(
    (open: boolean): void => {
      // Investigation instrumentation (Drawer openDrawer-no-op / toggleDrawer-no-animation bug):
      // every imperative caller (openDrawer/closeDrawer/toggleDrawer/jumpTo) funnels through here,
      // so this single seam proves whether Animated.timing is actually being started at all, and
      // with what toValue - a live-only failure (e.g. a stale progress ref, or Animated.timing
      // silently short-circuiting) would show up as this log firing with no visible motion. Kept
      // behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
      dlog(`Drawer: animateProgressTo(open=${open}) starting at t=${Date.now()}`);
      Animated.timing(progress, {
        toValue: open ? 1 : 0,
        duration: DRAWER_SNAP_DURATION,
        // Native-driver wiring (the AnimatedComponent passthrough opt-in ADR 0017 defines) is
        // deferred for v1 - see this file's header feasibility note. The JS timing loop still
        // drives every frame, same as any other non-native-driven Animated.timing in this codebase.
        useNativeDriver: false,
      }).start();
    },
    [progress],
  );

  const handle = useMemo<IDrawerNavigatorHandle>(
    () => ({
      openDrawer: () => {
        dlog(`Drawer: openDrawer() called, isOpen=${isOpenRef.current} at t=${Date.now()}`);
        animateProgressTo(true);
        dispatch({ type: 'openDrawer' });
      },
      closeDrawer: () => {
        dlog(`Drawer: closeDrawer() called, isOpen=${isOpenRef.current} at t=${Date.now()}`);
        animateProgressTo(false);
        dispatch({ type: 'closeDrawer' });
      },
      toggleDrawer: () => {
        dlog(`Drawer: toggleDrawer() called, isOpen=${isOpenRef.current} at t=${Date.now()}`);
        animateProgressTo(!isOpenRef.current);
        dispatch({ type: 'toggleDrawer' });
      },
      jumpTo: (name: string) => {
        dispatch({ type: 'jumpTo', name });
        if (isOpenRef.current) animateProgressTo(false);
      },
    }),
    [animateProgressTo],
  );

  useImperativeHandle(forwardedRef, () => handle, [handle]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (
        event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): boolean =>
        shouldClaimDrawerSwipe(
          event,
          gestureState,
          screenWidthRef.current,
          isOpenRef.current,
          optionsRef.current,
          'start',
        ),
      onMoveShouldSetPanResponder: (
        event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): boolean =>
        shouldClaimDrawerSwipe(
          event,
          gestureState,
          screenWidthRef.current,
          isOpenRef.current,
          optionsRef.current,
          'move',
        ),
      onPanResponderGrant: (): void => {
        dlog('Drawer: gesture grant');
        dragStartProgress.current = isOpenRef.current ? 1 : 0;
      },
      onPanResponderMove: (
        _event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): void => {
        const nextProgress = resolveDragProgress(
          gestureState,
          dragStartProgress.current,
          optionsRef.current,
        );
        progress.setValue(nextProgress);
      },
      onPanResponderRelease: (
        _event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): void => {
        const intent = resolveSwipeIntent(gestureState, isOpenRef.current, optionsRef.current);
        const open = intent === 'open';
        dlog(`Drawer: gesture release -> ${open ? 'open' : 'close'}`);
        animateProgressTo(open);
        dispatch(open ? { type: 'openDrawer' } : { type: 'closeDrawer' });
      },
      onPanResponderTerminate: (): void => {
        dlog('Drawer: gesture terminated, snapping back');
        animateProgressTo(isOpenRef.current);
      },
    }),
  ).current;

  const animated = isDrawerAnimated(options);
  const geometry = useMemo(
    () => resolveDrawerGeometry(options),
    [options.drawerType, options.drawerPosition, options.drawerWidth],
  );

  const panelSlot = animated ? resolveDrawerSlotInterpolation(geometry, 'panel') : undefined;
  const contentSlot = animated ? resolveDrawerSlotInterpolation(geometry, 'content') : undefined;
  const overlaySlot = animated ? resolveDrawerSlotInterpolation(geometry, 'overlay') : undefined;

  const panelTranslateX = panelSlot ? progress.interpolate(panelSlot.translateX) : undefined;
  const contentTranslateX = contentSlot ? progress.interpolate(contentSlot.translateX) : undefined;
  const overlayOpacity = overlaySlot ? progress.interpolate(overlaySlot.opacity) : undefined;
  // The overlay is a full-screen absolutely-positioned sibling BELOW content in paint order
  // (see render-drawer.ts's drawerChildOrder) - for 'front' that's fine since content never moves,
  // but for 'slide' content itself translates away by contentTranslateX, and without following it
  // the overlay stays pinned full-screen, dimming (and touch-capturing) the now-revealed panel
  // underneath instead of just the content sliver it's meant to dim. Tying overlay to the SAME
  // translateX as content keeps it registered exactly under content, wherever content actually is
  // (resolveDrawerSlotInterpolation's 'overlay' overload returns that same content delta).
  const overlayTranslateX = overlaySlot ? progress.interpolate(overlaySlot.translateX) : undefined;

  const focusedRoute = state.routes[state.index];
  const focusedEntry = focusedRoute ? registry.get(focusedRoute.name) : undefined;
  if (focusedRoute && !focusedEntry) {
    dlog(`Drawer: no screen registered for route name "${focusedRoute.name}"`);
  }

  // Only the focused route's screen is ever mounted (like Tab, unlike Stack which keeps every
  // pushed route alive), so a fresh emitter per focus change is sufficient - see tabs.ts's
  // matching comment for why no per-route emitter map is needed. Keyed on the route KEY, not the
  // route object, so a jumpTo-with-no-params re-focus of the ALREADY-focused route (a no-op in
  // drawerRouterReducer) and any future params merge don't spuriously re-fire focus/blur.
  const focusedRouteKey = focusedRoute?.key;
  const routeEmitter = useMemo(() => createNavigationEmitter(), [focusedRouteKey]);

  // Drawer paints its own panel in pure JS - there is no native onAppear/onDisappear to hook
  // (unlike Stack's RNSScreen), so focus/blur is synthesized here: mount = focus, cleanup = blur,
  // exactly what an effect keyed on focusedRouteKey already encodes - no diffFocusedRoute
  // indirection needed (unlike Vue/Angular, which diff real prev/next keys inside an imperative
  // watch/CD callback that has no mount/cleanup pairing of its own).
  useEffect(() => {
    if (focusedRouteKey === undefined) return undefined;
    dlog(`Drawer: route "${focusedRoute?.name}" focused`);
    routeEmitter.emit(NAVIGATION_EVENT_FOCUS);
    return () => {
      dlog(`Drawer: route "${focusedRoute?.name}" blurred`);
      routeEmitter.emit(NAVIGATION_EVENT_BLUR);
    };
    // focusedRoute omitted deliberately: only its .key (tracked via focusedRouteKey) should
    // re-run this effect - see the comment above on focusedRouteKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEmitter, focusedRouteKey]);

  const content =
    focusedEntry && focusedRoute
      ? createElement(
          NavigationContext.Provider,
          {
            value: {
              route: focusedRoute,
              navigation: handle,
              emitter: routeEmitter,
              parent: ambientContext,
            },
          },
          createElement(focusedEntry.component),
        )
      : null;

  const descriptors: IDrawerDescriptorMap = {};
  for (const route of state.routes) {
    const entry = registry.get(route.name);
    if (entry === undefined) continue;
    descriptors[route.key] = {
      options: resolveDrawerScreenOptions(entry, { route, navigation: handle }, screenOptions),
      navigation: handle,
    };
  }

  const drawerContent = renderDrawerContent?.({ state, descriptors, navigation: handle }) ?? null;

  const root = renderDrawer(
    {
      overlayColor: overlayColor ?? DRAWER_DEFAULT_OVERLAY_COLOR,
      drawerStyle,
      contentPassthrough: {},
      overlayPassthrough: animated
        ? {
            pointerEvents: state.isOpen ? 'auto' : 'none',
            onStartShouldSetResponder: () => true,
            onResponderRelease: () => {
              animateProgressTo(false);
              dispatch({ type: 'closeDrawer' });
            },
          }
        : {},
      panelPassthrough: {},
    },
    options,
  );

  const order = drawerChildOrder(options);
  const slots = new Map<IDrawerSlot, IDescriptor>();
  order.forEach((slot, index) => {
    const descriptor = root.children[index];
    if (typeof descriptor !== 'string') slots.set(slot, descriptor);
  });

  const slotChildren: Record<IDrawerSlot, ReactNode> = {
    content,
    overlay: null,
    panel: drawerContent,
  };
  // Each animated style holds an AnimatedInterpolation node, not a plain number/color - it feeds
  // only Animated.View's deliberately permissive `style?: unknown` (see create-animated-component.tsx),
  // never the plain-IViewStyle branch below, so this stays untyped rather than widening IViewStyle.
  const slotAnimatedStyle: Record<IDrawerSlot, unknown> = {
    content:
      contentTranslateX === undefined
        ? undefined
        : { transform: [{ translateX: contentTranslateX }] },
    overlay:
      overlayOpacity === undefined
        ? undefined
        : { opacity: overlayOpacity, transform: [{ translateX: overlayTranslateX }] },
    panel:
      panelTranslateX === undefined ? undefined : { transform: [{ translateX: panelTranslateX }] },
  };

  function renderSlot(slot: IDrawerSlot): ReactElement | null {
    const descriptor = slots.get(slot);
    if (descriptor === undefined) return null;
    const animatedStyle = slotAnimatedStyle[slot];
    if (animatedStyle === undefined) {
      return createElement(
        descriptor.type,
        { key: descriptor.key, ...descriptor.props },
        slotChildren[slot],
      );
    }
    const style = [descriptor.props.style, animatedStyle];
    return createElement(
      Animated.View,
      { key: descriptor.key, ...descriptor.props, style },
      slotChildren[slot],
    );
  }

  const drawerChildren = order
    .map(renderSlot)
    .filter((element): element is ReactElement => element !== null);

  return createElement(
    'symbiote-view',
    { style: root.props.style, ...panResponder.panHandlers },
    ...drawerChildren,
  );
});

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

// --- Explicit gap list vs the real react-native-gesture-handler + react-native-reanimated
// @react-navigation/drawer (confirmed against its current docs) ---
// 1. `configureGestureHandler` - a raw react-native-gesture-handler `Gesture` object escape
//    hatch. No PanResponder equivalent exists; not ported.
// 2. Simultaneous/failure gesture RELATIONSHIPS (gesture-handler's declarative composition vs a
//    nested ScrollView, another PanResponder, etc.) - PanResponder only offers negotiation via the
//    should-set boolean gates used here (edge-start + dominant-axis), which is more prone to an
//    accidental hijack of a nested horizontal ScrollView/Swiper than gesture-handler's system.
// 3. `useDrawerProgress` - a Reanimated SharedValue read on the UI thread. `progress` here is a
//    JS-thread AnimatedValue; interpolating it for consumer-facing content animation works, but
//    without native-driver wiring (gap noted above) it does not carry the same synchronous
//    UI-thread guarantee under JS-thread load.
// 4. `hideStatusBarOnOpen` / `keyboardDismissMode` / `statusBarAnimation` / `overlayStyle` - not
//    wired in this pass; straightforward additions once StatusBar/Keyboard module wiring is
//    needed here (not a PanResponder/Animated limitation, just unscoped for v1).
