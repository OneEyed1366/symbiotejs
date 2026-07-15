// Tab, the Vue lifecycle half. The focused-index router (tab-router-state) and the tab-bar
// Descriptor builder (render-tabs) live in @symbiote-native/navigation core, shared verbatim with
// the React/Angular adapters; here Vue supplies the lifecycle - a plain ref for the focused index
// (Vue's twin of useReducer), useId for route-key generation, expose() for the jumpTo/setParams
// handle - plus the descriptor bridge for the tab-bar leaf, exactly like Stack bridges its header
// config (stack.ts). Unlike Stack, a bottom-tabs bar is a PURE-JS UI: it paints ordinary
// `symbiote-view`/`symbiote-text` primitives via the shared render fn, so there is no
// react-native-screens ViewConfig to register here - Tab needs no `../register` import.

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
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createInitialTabState,
  createNavigationEmitter,
  diffFocusedRoute,
  isFocusedRoute,
  isRecord,
  renderTabBar,
  tabRouterReducer,
} from '../../core';
import type {
  INavigationEmitter,
  IRoute,
  ITabBarItemView,
  ITabNavigatorHandle,
  ITabOptions,
} from '../../core';
import { NavigationScope, injectNavigationScope } from '../navigation-context';
import { TabScreen } from '../tab-screen';
import type { ITabScreenOptionsArgs, ITabScreenProps } from '../tab-screen';

export type { ITabNavigatorHandle } from '../../core';

// React's `children?: ReactNode` becomes Vue's default slot instead (registered screens, read via
// collectRegistry below).
export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
};

type ITabRegistryEntry = {
  component: ITabScreenProps['component'];
  options: ITabScreenProps['options'];
  initialParams: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asComponent(value: unknown): ITabScreenProps['component'] | undefined {
  if (typeof value === 'function') return value as ITabScreenProps['component'];
  return isRecord(value) ? (value as ITabScreenProps['component']) : undefined;
}

// ITabOptions carries a handful of independently-optional fields forwarded wholesale into the
// shared render fn below - same "narrow the object-ness, cast at the exact I/O edge" rationale
// stack.ts's asScreenOptions documents (CLAUDE.md's ts-js rule).
function asTabOptions(value: unknown): ITabOptions | undefined {
  return isRecord(value) ? (value as ITabOptions) : undefined;
}

function asTabOptionsOrResolver(value: unknown): ITabScreenProps['options'] {
  if (typeof value === 'function') return value as ITabScreenProps['options'];
  return asTabOptions(value);
}

function collectRegistry(vnodes: readonly VNode[]): Map<string, ITabRegistryEntry> {
  const registry = new Map<string, ITabRegistryEntry>();
  for (const vnode of vnodes) {
    if (vnode.type !== TabScreen || !isRecord(vnode.props)) continue;
    const name = asString(vnode.props.name);
    const component = asComponent(vnode.props.component);
    if (name === undefined || component === undefined) continue;
    registry.set(name, {
      component,
      options: asTabOptionsOrResolver(vnode.props.options),
      initialParams: vnode.props.initialParams,
    });
  }
  return registry;
}

function resolveTabOptions(
  entry: ITabRegistryEntry,
  screenComponentProps: ITabScreenOptionsArgs,
  screenOptions: ITabOptions | undefined,
): ITabOptions {
  const own =
    typeof entry.options === 'function' ? entry.options(screenComponentProps) : entry.options;
  return { ...screenOptions, ...own };
}

const TAB_CONTENT_STYLE = { flex: 1 };
const TAB_ROOT_STYLE = { flex: 1 };

const TabImpl = defineComponent<ITabProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);

    // Read BEFORE this Tab establishes its own per-screen NavigationScope below - becomes the
    // `parent` link a nested screen's useNavigation().getParent() walks (e.g. this Tab rendered
    // as a Stack screen's content reaches that Stack via this value). undefined when this Tab is
    // the nesting root.
    const ambientScopeRef = injectNavigationScope();
    const routeIdPrefix = useId();

    function buildRoutes(registry: Map<string, ITabRegistryEntry>): IRoute<unknown>[] {
      return Array.from(registry.entries()).map(([name, entry]) => ({
        key: `${routeIdPrefix}-${name}`,
        name,
        params: entry.initialParams,
      }));
    }

    const initialRegistry = collectRegistry(slots.default?.() ?? []);
    const initialRoutes = buildRoutes(initialRegistry);
    if (initialRoutes.length === 0) dlog('Tab: no <Tab.Screen> children registered');

    const state = shallowRef(
      createInitialTabState(initialRoutes, asString(attrs.initialRouteName)),
    );

    function dispatch(action: Parameters<typeof tabRouterReducer>[1]): void {
      state.value = tabRouterReducer(state.value, action);
    }

    const jumpTo = (name: string, params?: unknown): void =>
      dispatch({ type: 'jumpTo', name, params });
    const setParams = (params: unknown, key: string): void =>
      dispatch({ type: 'setParams', key, params });

    const handle: ITabNavigatorHandle = { jumpTo, setParams };
    expose(handle);

    // Tab paints its own bar in pure JS - there is no native onAppear/onDisappear to hook (unlike
    // Stack's RNSScreen), so focus/blur is synthesized here: emit 'focus' once the newly-focused
    // route's content has mounted, 'blur' when it's about to be replaced or Tab itself unmounts.
    // Keyed on the route KEY (not the route object) so a setParams-only change (new route object,
    // same key) doesn't spuriously re-fire focus/blur - mirrors tabs.ts's React twin exactly,
    // just expressed as a `watch` over the focused key instead of a useEffect dependency array.
    function focusedKeyOf(current: typeof state.value): string | undefined {
      return current.routes[current.index]?.key;
    }

    // One emitter per route.key, created lazily and cached for the navigator's whole lifetime -
    // mirrors stack.ts's own `emitters` map. This decouples emitter IDENTITY (stable, looked up
    // by key, read by the render closure below when it builds a route's NavigationScope) from
    // emit TIMING (must wait until the focused screen has actually mounted and subscribed): a
    // scheme that instead tried to recreate/swap `routeEmitter` synchronously on each focus
    // change raced Vue's own render/mount cycle no matter which watch `flush` timing it used -
    // 'pre' emits before the new screen's onMounted subscribes, 'post' emits AFTER the render
    // closure already needed the (still up-to-date) emitter to build that screen's NavigationScope
    // in the FIRST place. A stable per-key lookup sidesteps the race entirely.
    const emitters = new Map<string, INavigationEmitter>();
    function emitterFor(routeKey: string): INavigationEmitter {
      let emitter = emitters.get(routeKey);
      if (emitter === undefined) {
        emitter = createNavigationEmitter();
        emitters.set(routeKey, emitter);
      }
      return emitter;
    }

    // Tab paints its own bar in pure JS - there is no native onAppear/onDisappear to hook (unlike
    // Stack's RNSScreen), so focus/blur is synthesized here: emit 'focus' once the newly-focused
    // route's content has mounted, 'blur' when it's about to be replaced or Tab itself unmounts.
    // Keyed on the route KEY (not the route object) so a setParams-only change (new route object,
    // same key) doesn't spuriously re-fire focus/blur - mirrors tabs.ts's React twin exactly,
    // just expressed as a `watch` over the focused key instead of a useEffect dependency array.
    let focusedRouteKey = focusedKeyOf(state.value);

    onMounted(() => {
      if (focusedRouteKey !== undefined) {
        dlog(`Tab: route "${focusedRouteKey}" focused at t=${Date.now()}`);
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
            dlog(`Tab: route "${blurKey}" blurred at t=${Date.now()}`);
            emitterFor(blurKey).emit(NAVIGATION_EVENT_BLUR);
          }
          if (focusKey !== undefined) {
            dlog(`Tab: route "${focusKey}" focused at t=${Date.now()}`);
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
      const screenOptions = asTabOptions(attrs.screenOptions);

      if (registry.size === 0) dlog('Tab: no <Tab.Screen> children registered');

      const focusedRoute: IRoute<unknown> | undefined = state.value.routes[state.value.index];

      const items: ITabBarItemView[] = state.value.routes.map((route, index) => {
        const entry = registry.get(route.name);
        const focused = isFocusedRoute(index, state.value.index);
        if (entry === undefined) {
          dlog(`Tab: no screen registered for route name "${route.name}"`);
          return { key: route.key, focused, label: route.name, passthrough: {} };
        }

        const options = resolveTabOptions(entry, { route, navigation: handle }, screenOptions);

        return {
          key: route.key,
          focused,
          label: options.tabBarLabel ?? options.title ?? route.name,
          icon: options.tabBarIcon,
          badge: options.tabBarBadge,
          activeTintColor: options.tabBarActiveTintColor,
          inactiveTintColor: options.tabBarInactiveTintColor,
          passthrough: {
            onPress: () => jumpTo(route.name),
            accessibilityRole: 'tab',
            accessibilityState: { selected: focused },
          },
        };
      });

      const focusedEntry = focusedRoute ? registry.get(focusedRoute.name) : undefined;
      const focusedOptions: ITabOptions | undefined =
        focusedEntry && focusedRoute
          ? resolveTabOptions(
              focusedEntry,
              { route: focusedRoute, navigation: handle },
              screenOptions,
            )
          : screenOptions;

      const tabBar = descriptorToVue(
        renderTabBar({ items, style: focusedOptions?.tabBarStyle, passthrough: {} }),
      );

      // Only the focused route's screen is ever mounted (unlike Stack, which keeps every pushed
      // route alive), so a fresh NavigationScope per focus change is sufficient - the previous
      // screen's whole subtree (and any listeners it registered) is torn down by an ordinary Vue
      // unmount when focus moves on.
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
              // NavigationScope provided just above (useRoute / useTabNavigation).
              () => h(focusedEntry.component),
            )
          : null;

      return h('symbiote-view', { style: TAB_ROOT_STYLE }, [
        h('symbiote-view', { style: TAB_CONTENT_STYLE }, content === null ? [] : [content]),
        tabBar,
      ]);
    };
  },
  { name: 'Tab', inheritAttrs: false },
);

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });
