// Drawer, the Vue lifecycle half. The open/closed + focused-route router (drawer-router-state)
// and the pure swipe/geometry math (drawer-options) live in @symbiote-native/navigation core,
// shared verbatim with the React/Angular adapters; here Vue supplies the lifecycle - a plain ref
// for the router (Vue's twin of useReducer), a PanResponder for the swipe gesture (built ONCE in
// setup, its callbacks reading options/window-width/isOpen LIVE off Vue's own reactive `attrs` /
// composable refs at gesture time - Vue's reactivity already gives every gesture callback the
// CURRENT value with no ref-mirroring dance, unlike React's useRef(value); value = X every
// render), an Animated.Value driving the slide/opacity transforms, and expose() for the
// open/close/toggle/jumpTo handle - mirroring tabs.ts's shape (Tab is the closer sibling: both are
// fixed-route-list, no-react-native-screens navigators; Stack's push/pop + native-screen bridging
// don't apply here).
//
// FEASIBILITY NOTE (see the drawer skill / PR description for the full writeup, mirrored from
// react/drawer.ts): the REAL @react-navigation/drawer is built on react-native-gesture-handler +
// react-native-reanimated, neither of which this codebase depends on. What's built here reaches
// the same swipe-to-open/close + front/back/slide/permanent behavior using only PanResponder +
// Animated (both already in @symbiote-native/engine), which is sufficient for a solid drawer but
// NOT byte-for-byte parity - see the explicit gap list at the bottom of this file (verbatim from
// the React twin - the gaps are architectural, not adapter-specific).

import {
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useId,
  watch,
} from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import {
  Animated,
  PanResponder,
  normalizeVueAttrs,
  useWindowDimensions,
} from '@symbiote-native/vue';
import type { IPanResponderGestureState, ISymbioteEvent } from '@symbiote-native/vue';
import type { IDescriptor } from '@symbiote-native/components';
import { dlog } from '@symbiote-native/engine';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import {
  DRAWER_DEFAULT_OVERLAY_COLOR,
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createInitialDrawerRouterState,
  createNavigationEmitter,
  diffFocusedRoute,
  drawerChildOrder,
  drawerRouterReducer,
  isDrawerAnimated,
  isRecord,
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
  IDrawerPosition,
  IDrawerRouterState,
  IDrawerScreenOptions,
  IDrawerSlot,
  IDrawerType,
  INavigationEmitter,
  IRoute,
} from '../../core';
import { NavigationScope, injectNavigationScope } from '../navigation-context';
import { DrawerScreen } from '../drawer-screen';
import type { IDrawerScreenOptionsArgs, IDrawerScreenProps } from '../drawer-screen';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

// React's `renderDrawerContent` render-PROP becomes a scoped SLOT here, mirroring Pressable's own
// `slots.default(state)` scoped-slot precedent in this codebase.

export type IDrawerContentSlotProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

// React's `children?: ReactNode` becomes Vue's default slot instead (registered screens, read via
// collectRegistry below); `renderDrawerContent` becomes the `drawerContent` scoped slot above.
export type IDrawerProps = IDrawerOptions & {
  initialRouteName?: string;
  drawerStyle?: IStyleProp<IViewStyle>;
};

type IDrawerRegistryEntry = {
  component: IDrawerScreenProps['component'];
  options: IDrawerScreenProps['options'];
  initialParams: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return isRecord(value);
}

const DRAWER_TYPES: ReadonlyArray<IDrawerType> = ['front', 'back', 'slide', 'permanent'];
// .some() itself doesn't narrow `value`'s type back at the call site - the `value is IDrawerType`
// predicate on THIS function is what lets asDrawerType's ternary return `value` typed, mirroring
// Modal's isOrientation guard (adapters/vue/src/components/modal.ts).
function isDrawerType(value: unknown): value is IDrawerType {
  return typeof value === 'string' && DRAWER_TYPES.some(type => type === value);
}
function asDrawerType(value: unknown): IDrawerType | undefined {
  return isDrawerType(value) ? value : undefined;
}

const DRAWER_POSITIONS: ReadonlyArray<IDrawerPosition> = ['left', 'right'];
function isDrawerPosition(value: unknown): value is IDrawerPosition {
  return typeof value === 'string' && DRAWER_POSITIONS.some(position => position === value);
}
function asDrawerPosition(value: unknown): IDrawerPosition | undefined {
  return isDrawerPosition(value) ? value : undefined;
}

function asComponent(value: unknown): IDrawerScreenProps['component'] | undefined {
  if (typeof value === 'function') return value as IDrawerScreenProps['component'];
  return isRecord(value) ? (value as IDrawerScreenProps['component']) : undefined;
}

// IDrawerScreenOptions carries only `title`/`drawerLabel`, small enough for direct field guards -
// kept as a single cast-at-the-edge helper anyway for symmetry with stack.ts/tabs.ts's
// asScreenOptions/asTabOptions (same CLAUDE.md-sanctioned I/O-edge narrowing).
function asDrawerScreenOptions(value: unknown): IDrawerScreenOptions | undefined {
  return isRecord(value) ? (value as IDrawerScreenOptions) : undefined;
}

function asDrawerScreenOptionsOrResolver(value: unknown): IDrawerScreenProps['options'] {
  if (typeof value === 'function') return value as IDrawerScreenProps['options'];
  return asDrawerScreenOptions(value);
}

function collectRegistry(vnodes: readonly VNode[]): Map<string, IDrawerRegistryEntry> {
  const registry = new Map<string, IDrawerRegistryEntry>();
  for (const vnode of vnodes) {
    if (vnode.type !== DrawerScreen || !isRecord(vnode.props)) continue;
    const name = asString(vnode.props.name);
    const component = asComponent(vnode.props.component);
    if (name === undefined || component === undefined) continue;
    registry.set(name, {
      component,
      options: asDrawerScreenOptionsOrResolver(vnode.props.options),
      initialParams: vnode.props.initialParams,
    });
  }
  return registry;
}

function resolveDrawerScreenOptions(
  entry: IDrawerRegistryEntry,
  screenComponentProps: IDrawerScreenOptionsArgs,
): IDrawerScreenOptions {
  if (typeof entry.options === 'function') return entry.options(screenComponentProps);
  return entry.options ?? {};
}

const DRAWER_SNAP_DURATION = 250;

const DrawerImpl = defineComponent<IDrawerProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);

    // Read BEFORE this Drawer establishes its own per-screen NavigationScope below - becomes the
    // `parent` link a nested screen's useNavigation().getParent() walks. undefined when this
    // Drawer is the nesting root.
    const ambientScopeRef = injectNavigationScope();

    function currentOptions(): IDrawerOptions {
      return {
        drawerType: asDrawerType(attrs.drawerType),
        drawerPosition: asDrawerPosition(attrs.drawerPosition),
        drawerWidth: asNumber(attrs.drawerWidth),
        overlayColor: asString(attrs.overlayColor),
        swipeEnabled: asBoolean(attrs.swipeEnabled),
        swipeEdgeWidth: asNumber(attrs.swipeEdgeWidth),
        swipeMinDistance: asNumber(attrs.swipeMinDistance),
        swipeMinVelocity: asNumber(attrs.swipeMinVelocity),
      };
    }

    let routeSequence = 0;
    const routeIdPrefix = useId();

    function buildRoutes(registry: Map<string, IDrawerRegistryEntry>): IRoute<unknown>[] {
      return Array.from(registry.entries()).map(([name, entry]) => {
        routeSequence += 1;
        return {
          key: `${routeIdPrefix}-${name}-${routeSequence}`,
          name,
          params: entry.initialParams,
        };
      });
    }

    const initialRegistry = collectRegistry(slots.default?.() ?? []);
    const initialRoutes = buildRoutes(initialRegistry);
    if (initialRoutes.length === 0) dlog('Drawer: no <Drawer.Screen> children registered');

    const state = shallowRef(
      createInitialDrawerRouterState(initialRoutes, asString(attrs.initialRouteName)),
    );

    function dispatch(action: Parameters<typeof drawerRouterReducer>[1]): void {
      state.value = drawerRouterReducer(state.value, action);
    }

    const windowDimensions = useWindowDimensions();

    // progress: 0 closed -> 1 open, the single Animated.Value every slide/opacity transform below
    // interpolates from. A plain `const` (not a ref): setup() runs once, so this needs no
    // re-creation guard the way React's useRef(new Animated.Value(...)).current does.
    const progress = new Animated.Value(state.value.isOpen ? 1 : 0);
    // Where a drag STARTS from, in progress units. Always exactly 0 or 1: a gesture only ever
    // begins at rest, since terminate/release always snap the value back to a resting state
    // before another grant can fire.
    let dragStartProgress = 0;

    function animateProgressTo(open: boolean): void {
      dlog(`Drawer: animateProgressTo(open=${open}) starting at t=${Date.now()}`);
      Animated.timing(progress, {
        toValue: open ? 1 : 0,
        duration: DRAWER_SNAP_DURATION,
        // Native-driver wiring is deferred for v1 - see this file's header feasibility note. The
        // JS timing loop still drives every frame, same as any other non-native-driven
        // Animated.timing in this codebase.
        useNativeDriver: false,
      }).start();
    }

    const handle: IDrawerNavigatorHandle = {
      openDrawer: () => {
        dlog(`Drawer: openDrawer() called, isOpen=${state.value.isOpen} at t=${Date.now()}`);
        animateProgressTo(true);
        dispatch({ type: 'openDrawer' });
      },
      closeDrawer: () => {
        dlog(`Drawer: closeDrawer() called, isOpen=${state.value.isOpen} at t=${Date.now()}`);
        animateProgressTo(false);
        dispatch({ type: 'closeDrawer' });
      },
      toggleDrawer: () => {
        dlog(`Drawer: toggleDrawer() called, isOpen=${state.value.isOpen} at t=${Date.now()}`);
        animateProgressTo(!state.value.isOpen);
        dispatch({ type: 'toggleDrawer' });
      },
      jumpTo: (name: string) => {
        // Captured BEFORE dispatch: unlike React's isOpenRef (only refreshed at the TOP of the
        // next render, so it still holds the pre-dispatch value here since React batches the
        // re-render asynchronously), this ref's `.value` mutates SYNCHRONOUSLY inside dispatch -
        // reading it after dispatch would already see the reducer's own isOpen: false.
        const wasOpen = state.value.isOpen;
        dispatch({ type: 'jumpTo', name });
        if (wasOpen) animateProgressTo(false);
      },
    };
    expose(handle);

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: (
        event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): boolean =>
        shouldClaimDrawerSwipe(
          event,
          gestureState,
          windowDimensions.value.width,
          state.value.isOpen,
          currentOptions(),
          'start',
        ),
      onMoveShouldSetPanResponder: (
        event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): boolean =>
        shouldClaimDrawerSwipe(
          event,
          gestureState,
          windowDimensions.value.width,
          state.value.isOpen,
          currentOptions(),
          'move',
        ),
      onPanResponderGrant: (): void => {
        dlog('Drawer: gesture grant');
        dragStartProgress = state.value.isOpen ? 1 : 0;
      },
      onPanResponderMove: (
        _event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): void => {
        progress.setValue(resolveDragProgress(gestureState, dragStartProgress, currentOptions()));
      },
      onPanResponderRelease: (
        _event: ISymbioteEvent,
        gestureState: IPanResponderGestureState,
      ): void => {
        const intent = resolveSwipeIntent(gestureState, state.value.isOpen, currentOptions());
        const open = intent === 'open';
        dlog(`Drawer: gesture release -> ${open ? 'open' : 'close'}`);
        animateProgressTo(open);
        dispatch(open ? { type: 'openDrawer' } : { type: 'closeDrawer' });
      },
      onPanResponderTerminate: (): void => {
        dlog('Drawer: gesture terminated, snapping back');
        animateProgressTo(state.value.isOpen);
      },
    });

    // Only the focused route's screen is ever mounted (like Tab, unlike Stack which keeps every
    // pushed route alive). One emitter per route.key, created lazily and cached for the
    // navigator's whole lifetime (mirrors stack.ts's own `emitters` map) - see tabs.ts's matching
    // comment for why a stable per-key lookup, not a recreate-on-change scheme, is what actually
    // avoids racing Vue's own render/mount cycle regardless of which watch `flush` timing is used.
    function focusedKeyOf(current: IDrawerRouterState): string | undefined {
      return current.routes[current.index]?.key;
    }

    const emitters = new Map<string, INavigationEmitter>();
    function emitterFor(routeKey: string): INavigationEmitter {
      let emitter = emitters.get(routeKey);
      if (emitter === undefined) {
        emitter = createNavigationEmitter();
        emitters.set(routeKey, emitter);
      }
      return emitter;
    }

    // Emitted from onMounted (NOT from inside the render closure below, which runs before the
    // focused screen's own component ever mounts - an emit there always has zero subscribers).
    let focusedRouteKey = focusedKeyOf(state.value);

    onMounted(() => {
      if (focusedRouteKey !== undefined) {
        dlog(`Drawer: route "${focusedRouteKey}" focused at t=${Date.now()}`);
        emitterFor(focusedRouteKey).emit(NAVIGATION_EVENT_FOCUS);
      }
    });

    // The bookkeeping (which key is focused) updates immediately so the render closure below
    // always reads the right route; the actual emit is deferred to nextTick(), which resolves
    // only after the CURRENT flush cycle fully drains - including the newly-focused screen's own
    // onMounted (subscribing its useIsFocused/useFocusEffect listeners). flush:'post' alone is
    // NOT enough here: it only guarantees this callback runs after THIS component's own render
    // effect, not after an arbitrary sibling post-flush job (a just-mounted child's onMounted)
    // that may be queued after it in the same batch - nextTick is the one API that waits for the
    // WHOLE cycle, not just this watcher's own slot in it.
    watch(
      () => focusedKeyOf(state.value),
      nextKey => {
        const { blurKey, focusKey } = diffFocusedRoute(focusedRouteKey, nextKey);
        if (blurKey === undefined && focusKey === undefined) return;
        focusedRouteKey = nextKey;
        nextTick(() => {
          if (blurKey !== undefined) {
            dlog(`Drawer: route "${blurKey}" blurred at t=${Date.now()}`);
            emitterFor(blurKey).emit(NAVIGATION_EVENT_BLUR);
          }
          if (focusKey !== undefined) {
            dlog(`Drawer: route "${focusKey}" focused at t=${Date.now()}`);
            emitterFor(focusKey).emit(NAVIGATION_EVENT_FOCUS);
          }
        });
      },
    );
    onUnmounted(() => {
      if (focusedRouteKey !== undefined) emitterFor(focusedRouteKey).emit(NAVIGATION_EVENT_BLUR);
    });

    return () => {
      const registry = collectRegistry(slots.default?.() ?? []);
      const options = currentOptions();
      const drawerStyle = isStyleProp(attrs.drawerStyle) ? attrs.drawerStyle : undefined;

      if (registry.size === 0) dlog('Drawer: no <Drawer.Screen> children registered');

      const animated = isDrawerAnimated(options);
      const geometry = resolveDrawerGeometry(options);

      const panelTranslateX = animated
        ? progress.interpolate(resolveDrawerSlotInterpolation(geometry, 'panel').translateX)
        : undefined;
      const contentTranslateX = animated
        ? progress.interpolate(resolveDrawerSlotInterpolation(geometry, 'content').translateX)
        : undefined;
      // The overlay is a full-screen absolutely-positioned sibling BELOW content in paint order
      // (see render-drawer.ts's drawerChildOrder) - for 'front' that's fine since content never
      // moves, but for 'slide' content itself translates away by contentTranslateX, and without
      // following it the overlay stays pinned full-screen. resolveDrawerSlotInterpolation's
      // 'overlay' branch ties its translateX to the SAME range as content's for exactly this
      // reason, so overlayOpacity and overlayTranslateX below share one resolved config.
      const overlayInterpolation = animated
        ? resolveDrawerSlotInterpolation(geometry, 'overlay')
        : undefined;
      const overlayOpacity = overlayInterpolation
        ? progress.interpolate(overlayInterpolation.opacity)
        : undefined;
      const overlayTranslateX = overlayInterpolation
        ? progress.interpolate(overlayInterpolation.translateX)
        : undefined;

      const focusedRoute = state.value.routes[state.value.index];
      const focusedEntry = focusedRoute ? registry.get(focusedRoute.name) : undefined;
      if (focusedRoute && !focusedEntry) {
        dlog(`Drawer: no screen registered for route name "${focusedRoute.name}"`);
      }

      const content =
        focusedEntry && focusedRoute
          ? h(
              NavigationScope,
              {
                value: {
                  route: focusedRoute,
                  navigation: handle,
                  emitter: emitterFor(focusedRoute.key),
                  parent: ambientScopeRef?.value,
                },
              },
              // No route/navigation props: the screen reads both through composables off the
              // NavigationScope provided just above (useRoute / useDrawerNavigation).
              () => h(focusedEntry.component),
            )
          : null;

      const descriptors: IDrawerDescriptorMap = {};
      for (const route of state.value.routes) {
        const entry = registry.get(route.name);
        if (entry === undefined) continue;
        descriptors[route.key] = {
          options: resolveDrawerScreenOptions(entry, { route, navigation: handle }),
          navigation: handle,
        };
      }

      const drawerContent =
        slots.drawerContent?.({ state: state.value, descriptors, navigation: handle }) ?? null;

      const root = renderDrawer(
        {
          overlayColor: asString(attrs.overlayColor) ?? DRAWER_DEFAULT_OVERLAY_COLOR,
          drawerStyle,
          contentPassthrough: {},
          overlayPassthrough: animated
            ? {
                pointerEvents: state.value.isOpen ? 'auto' : 'none',
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
      const slotDescriptors = new Map<IDrawerSlot, IDescriptor>();
      order.forEach((slot, index) => {
        const descriptor = root.children[index];
        if (typeof descriptor !== 'string') slotDescriptors.set(slot, descriptor);
      });

      const slotChildren: Record<IDrawerSlot, VNode[] | null> = {
        content: content === null ? [] : [content],
        overlay: null,
        panel: drawerContent,
      };
      // Each animated style holds an AnimatedInterpolation node, not a plain number/color - it
      // feeds only Animated.View's deliberately permissive `style?: unknown`, never the plain-
      // IViewStyle branch below, so this stays untyped rather than widening IViewStyle.
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
          panelTranslateX === undefined
            ? undefined
            : { transform: [{ translateX: panelTranslateX }] },
      };

      function renderSlot(slot: IDrawerSlot): VNode | null {
        const descriptor = slotDescriptors.get(slot);
        if (descriptor === undefined) return null;
        const children = slotChildren[slot] ?? [];
        const animatedStyle = slotAnimatedStyle[slot];
        if (animatedStyle === undefined) {
          return h(descriptor.type, { key: descriptor.key, ...descriptor.props }, children);
        }
        const style = [descriptor.props.style, animatedStyle];
        return h(Animated.View, { key: descriptor.key, ...descriptor.props, style }, children);
      }

      const drawerChildren = order
        .map(renderSlot)
        .filter((element): element is VNode => element !== null);

      return h(
        'symbiote-view',
        { style: root.props.style, ...panResponder.panHandlers },
        drawerChildren,
      );
    };
  },
  { name: 'Drawer', inheritAttrs: false },
);

export const Drawer = Object.assign(DrawerImpl, { Screen: DrawerScreen });

// --- Explicit gap list vs the real react-native-gesture-handler + react-native-reanimated
// @react-navigation/drawer (confirmed against its current docs, mirrored verbatim from the React
// twin - the gaps are architectural, not adapter-specific) ---
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
