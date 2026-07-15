// Tab, the React lifecycle half. The focused-index router (tab-router-state) and the tab-bar
// Descriptor builder (render-tabs) live in @symbiote-native/navigation core, shared verbatim
// with the Vue/Angular adapters; here React supplies the lifecycle - useReducer for the focused
// index, useId for route-key generation, useImperativeHandle for the jumpTo/setParams handle -
// plus the descriptor bridge for the tab-bar leaf, exactly like Stack bridges its header config
// (react/stack.ts). Unlike Stack, a bottom-tabs bar is a PURE-JS UI: it paints ordinary
// `symbiote-view`/`symbiote-text` primitives via the shared render fn, so there is no
// react-native-screens ViewConfig to register here - Tab needs no `../register` import.

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
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import { dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createInitialTabState,
  createNavigationEmitter,
  isFocusedRoute,
  renderTabBar,
  tabRouterReducer,
} from '../../core';
import type { IRoute, ITabBarItemView, ITabNavigatorHandle, ITabOptions } from '../../core';
import { collectRegistry } from '../collect-registry';
import { NavigationContext } from '../navigation-context';
import { TabScreen } from '../tab-screen';
import type { ITabScreenOptionsArgs, ITabScreenProps } from '../tab-screen';

export type { ITabNavigatorHandle } from '../../core';

export type ITabProps = {
  initialRouteName?: string;
  screenOptions?: ITabOptions;
  children?: ReactNode;
};

type ITabRegistryEntry = Omit<ITabScreenProps, 'name'>;

function isTabScreenElement(child: ReactNode): child is ReactElement<ITabScreenProps> {
  return isValidElement(child) && child.type === TabScreen;
}

function resolveTabOptions(
  entry: ITabRegistryEntry,
  optionsArgs: ITabScreenOptionsArgs,
  screenOptions: ITabOptions | undefined,
): ITabOptions {
  const own = typeof entry.options === 'function' ? entry.options(optionsArgs) : entry.options;
  return { ...screenOptions, ...own };
}

const TAB_CONTENT_STYLE = { flex: 1 };
const TAB_ROOT_STYLE = { flex: 1 };

const TabImpl = forwardRef<ITabNavigatorHandle, ITabProps>((props, forwardedRef) => {
  // Read BEFORE establishing this Tab's own Context value below - becomes the `parent` link a
  // nested screen's useNavigation().getParent() walks (e.g. this Tab rendered as a Stack screen's
  // content reaches that Stack via this value). undefined when this Tab is the nesting root.
  const ambientContext = useContext(NavigationContext);
  const registry = useMemo(
    () => collectRegistry(props.children, isTabScreenElement),
    [props.children],
  );
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

  const [state, dispatch] = useReducer(tabRouterReducer, undefined, () =>
    createInitialTabState(routes, props.initialRouteName),
  );

  if (routes.length === 0) dlog('Tab: no <Tab.Screen> children registered');

  const jumpTo = useCallback(
    (name: string, params?: unknown) => dispatch({ type: 'jumpTo', name, params }),
    [],
  );
  const setParams = useCallback(
    (params: unknown, key: string) => dispatch({ type: 'setParams', key, params }),
    [],
  );

  const handle = useMemo<ITabNavigatorHandle>(() => ({ jumpTo, setParams }), [jumpTo, setParams]);

  useImperativeHandle(forwardedRef, () => handle, [handle]);

  const focusedRoute: IRoute<unknown> | undefined = state.routes[state.index];

  const items: ITabBarItemView[] = state.routes.map((route, index) => {
    const entry = registry.get(route.name);
    const focused = isFocusedRoute(index, state.index);
    if (!entry) {
      dlog(`Tab: no screen registered for route name "${route.name}"`);
      return {
        key: route.key,
        focused,
        label: route.name,
        passthrough: {},
      };
    }

    const options = resolveTabOptions(entry, { route, navigation: handle }, props.screenOptions);

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
          props.screenOptions,
        )
      : props.screenOptions;

  const tabBar = descriptorToReact(
    renderTabBar({ items, style: focusedOptions?.tabBarStyle, passthrough: {} }),
  );

  // Only the focused route's screen is ever mounted (unlike Stack, which keeps every pushed route
  // alive), so a fresh emitter per focus change is sufficient - no per-route emitter map to prune,
  // because the previous screen's whole subtree (and any listeners it registered) is torn down by
  // an ordinary React unmount when focus moves on. Keyed on the route KEY rather than the route
  // object so a setParams-only change (new route object, same key) doesn't spuriously re-fire
  // focus/blur.
  const focusedRouteKey = focusedRoute?.key;
  const routeEmitter = useMemo(() => createNavigationEmitter(), [focusedRouteKey]);

  // Tab paints its own bar in pure JS - there is no native onAppear/onDisappear to hook (unlike
  // Stack's RNSScreen), so focus/blur is synthesized here: mount = focus, cleanup = blur, exactly
  // what an effect keyed on focusedRouteKey already encodes - no diffFocusedRoute indirection
  // needed (unlike Vue/Angular, which diff real prev/next keys inside an imperative watch/CD
  // callback that has no mount/cleanup pairing of its own).
  useEffect(() => {
    if (focusedRouteKey === undefined) return undefined;
    dlog(`Tab: route "${focusedRoute?.name}" focused`);
    routeEmitter.emit(NAVIGATION_EVENT_FOCUS);
    return () => {
      dlog(`Tab: route "${focusedRoute?.name}" blurred`);
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

  return createElement(
    'symbiote-view',
    { style: TAB_ROOT_STYLE },
    createElement('symbiote-view', { style: TAB_CONTENT_STYLE }, content),
    tabBar,
  );
});

export const Tab = Object.assign(TabImpl, { Screen: TabScreen });
