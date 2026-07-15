// Stack, the Vue lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the React/Angular adapters; here Vue supplies the lifecycle - a plain ref
// for the pushed-route stack (Vue's twin of useReducer: reassign `.value` from the same pure
// reducer), useId + a closure counter for route-key generation, expose() for the push/pop/replace
// navigator handle - plus the descriptor bridge for the header config leaf. Pushing/popping a
// route is an ordinary child mount/unmount: RNSScreenStack diffs its RNSScreen children natively,
// so no imperative native command is needed here at all. Neither this nor the Screen marker
// imports react-native-screens' own React components (ScreenStack.tsx et al - hooks, crashes a
// non-React adapter); the native views are driven directly through the ViewConfig ../register
// registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.

import { defineComponent, h, shallowRef, useId } from '@vue/runtime-core';
import type { VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import { Platform, debugNodeId, dlog, isSymbioteNode } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  NAVIGATION_EVENT_STATE,
  RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
  RNS_SCREEN_STACK_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  SCREEN_ON_APPEAR,
  SCREEN_ON_DISAPPEAR,
  SCREEN_ON_DISMISSED,
  SCREEN_ON_HEADER_BACK_BUTTON_CLICKED,
  SCREEN_ON_WILL_APPEAR,
  SCREEN_ON_WILL_DISAPPEAR,
  STACK_ON_FINISH_TRANSITIONING,
  buildSearchBarHandle,
  buildSearchBarPassthrough,
  computeActivityState,
  createInitialNavigatorState,
  createNavigationEmitter,
  isRecord,
  navigatorReducer,
  resolveScreenRenderPlan,
  resolveStackProps,
} from '../../core';
import type {
  INavigationEmitter,
  INavigatorHandle,
  INavigatorPlatform,
  INavigatorState,
  IRoute,
} from '../../core';
import { NavigationScope, injectNavigationScope } from '../navigation-context';
import { Screen } from '../screen';
import type { IScreenOptionsArgs, IScreenProps, IVueScreenOptions } from '../screen';

export type { INavigatorHandle } from '../../core';

// React's `children?: ReactNode` becomes Vue's default slot instead (registered screens, read via
// collectRegistry below) - same split Modal's IModalProps documents.
export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: IVueScreenOptions;
};

// backTitleVisible defaults to `true` on both platforms per the codegen spec's own default
// (CT.WithDefault<boolean, 'true'>) - no ios/android divergence in v1 scope, so a single constant
// stands in for the per-platform injection point ISliderPlatform-style adapters use elsewhere.
const NAVIGATOR_PLATFORM: INavigatorPlatform = { defaultHeaderBackTitleVisible: true };

type IScreenRegistryEntry = {
  component: IScreenProps['component'];
  options: IScreenProps['options'];
  initialParams: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asComponent(value: unknown): IScreenProps['component'] | undefined {
  if (typeof value === 'function') return value as IScreenProps['component'];
  return isRecord(value) ? (value as IScreenProps['component']) : undefined;
}

// screenOptions/options each carry ~20 independently-optional fields (IScreenOptions,
// navigator-props.ts) forwarded wholesale into the core resolvers below - a per-field guard would
// just hand-reimplement TypeScript's own structural check, so this narrows only the object-ness at
// the exact I/O edge where Vue's untyped attrs enter the strongly-typed core surface, per
// CLAUDE.md's ts-js rule ("the I/O edge where data enters the type system, in the narrowest form").
function asScreenOptions(value: unknown): IVueScreenOptions | undefined {
  return isRecord(value) ? (value as IVueScreenOptions) : undefined;
}

function asScreenOptionsOrResolver(value: unknown): IScreenProps['options'] {
  if (typeof value === 'function') return value as IScreenProps['options'];
  return asScreenOptions(value);
}

function collectRegistry(vnodes: readonly VNode[]): Map<string, IScreenRegistryEntry> {
  const registry = new Map<string, IScreenRegistryEntry>();
  for (const vnode of vnodes) {
    if (vnode.type !== Screen || !isRecord(vnode.props)) continue;
    const name = asString(vnode.props.name);
    const component = asComponent(vnode.props.component);
    if (name === undefined || component === undefined) continue;
    registry.set(name, {
      component,
      options: asScreenOptionsOrResolver(vnode.props.options),
      initialParams: vnode.props.initialParams,
    });
  }
  return registry;
}

function resolveScreenOptions(
  entry: IScreenRegistryEntry,
  screenOptionsArgs: IScreenOptionsArgs,
  screenOptions: IVueScreenOptions | undefined,
): IVueScreenOptions {
  const own =
    typeof entry.options === 'function' ? entry.options(screenOptionsArgs) : entry.options;
  return { ...screenOptions, ...own };
}

const StackImpl = defineComponent<IStackProps>(
  (_props, { attrs: rawAttrs, slots, expose }) => {
    const attrs = normalizeVueAttrs(rawAttrs);

    // Read BEFORE this Stack establishes its own per-screen NavigationScope below - becomes
    // the `parent` link a nested screen's useNavigation().getParent() walks (e.g. this Stack
    // rendered as a Tab screen's content reaches that Tab via this value). undefined when this
    // Stack is the nesting root. Kept as the injected ref itself (not unwrapped here) so the
    // render loop below always reads its CURRENT `.value`, matching React's useContext
    // re-reading on every render.
    const ambientScopeRef = injectNavigationScope();

    const routeIdPrefix = useId();
    let routeSequence = 0;
    // One emitter per route.key, keyed exactly like routeSequence's counter is scoped - created
    // lazily the first time a route is rendered, pruned once it's popped off the stack (below).
    const emitters = new Map<string, INavigationEmitter>();
    // Investigation instrumentation (flicker-on-focus bug): route keys whose resolved
    // transition/animation-timing props have already been logged, so the once-per-mount dump
    // below doesn't spam on every re-render. Kept behind DEBUG, never removed.
    const loggedScreenPropKeys = new Set<string>();

    function emitterFor(routeKey: string): INavigationEmitter {
      let emitter = emitters.get(routeKey);
      if (emitter === undefined) {
        emitter = createNavigationEmitter();
        emitters.set(routeKey, emitter);
      }
      return emitter;
    }

    function createRoute(name: string, params: unknown): IRoute<unknown> {
      routeSequence += 1;
      return { key: `${routeIdPrefix}-${name}-${routeSequence}`, name, params };
    }

    const initialRegistry = collectRegistry(slots.default?.() ?? []);
    const initialRouteName =
      asString(attrs.initialRouteName) ?? initialRegistry.keys().next().value;
    let initialState: INavigatorState;
    if (initialRouteName === undefined) {
      dlog('Stack: no <Stack.Screen> children registered');
      initialState = createInitialNavigatorState({
        key: routeIdPrefix,
        name: '',
        params: undefined,
      });
    } else {
      initialState = createInitialNavigatorState(
        createRoute(initialRouteName, initialRegistry.get(initialRouteName)?.initialParams),
      );
    }

    const state = shallowRef<INavigatorState>(initialState);

    function dispatch(action: Parameters<typeof navigatorReducer>[1]): void {
      state.value = navigatorReducer(state.value, action);
    }

    const handle: INavigatorHandle = {
      push: (name, params) => dispatch({ type: 'push', route: createRoute(name, params) }),
      pop: count => dispatch({ type: 'pop', count }),
      popToTop: () => dispatch({ type: 'popToTop' }),
      popTo: key => dispatch({ type: 'popTo', key }),
      replace: (name, params) => dispatch({ type: 'replace', route: createRoute(name, params) }),
      setParams: (params, key) => dispatch({ type: 'setParams', key, params }),
      reset: nextState => dispatch({ type: 'reset', state: nextState }),
      canGoBack: () => state.value.routes.length > 1,
    };
    expose(handle);

    // Broadcasts the router state to every still-live route's emitter (useNavigationState's
    // source) after each commit, and prunes emitters for routes popped off the stack - mirroring
    // React's own subscribe-in-effect pattern. `watch` isn't needed here (unlike React's
    // useEffect, which must be deferred past render to avoid a descendant setState-during-render):
    // Vue's provide/inject + shallowRef.value writes are safe to perform directly inside the
    // render closure below, so the broadcast happens right there, once per render.
    function broadcastState(): void {
      for (const route of state.value.routes) {
        emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, state.value);
      }
      for (const routeKey of emitters.keys()) {
        if (!state.value.routes.some(route => route.key === routeKey)) emitters.delete(routeKey);
      }
    }

    return () => {
      broadcastState();
      const registry = collectRegistry(slots.default?.() ?? []);
      const screenOptions = asScreenOptions(attrs.screenOptions);

      // Investigation instrumentation (flicker-on-focus bug): STACK_ON_FINISH_TRANSITIONING is
      // the native signal that the WHOLE push/pop animation has finished (as opposed to
      // onAppear/onDisappear, which are per-screen) - logging it lets the per-screen
      // appear/disappear timestamps be checked against the actual transition-complete moment.
      // Kept behind DEBUG, never removed.
      const stackProps = resolveStackProps({
        passthrough: {
          [STACK_ON_FINISH_TRANSITIONING]: () =>
            dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
        },
      });

      const children = state.value.routes.map((route, index) => {
        const entry = registry.get(route.name);
        if (entry === undefined) {
          dlog(`Stack: no screen registered for route name "${route.name}"`);
          return null;
        }

        const screenOptionsArgs: IScreenOptionsArgs = { route, navigation: handle };
        const mergedOptions = resolveScreenOptions(entry, screenOptionsArgs, screenOptions);
        const activityState = computeActivityState(index, state.value.routes.length);
        // Investigation instrumentation (flicker-on-focus bug): fires on EVERY Stack render, not
        // just on transitions, so the log stream shows whether a route's activityState/index ever
        // changes outside of a push/pop dispatch. Kept behind DEBUG, never removed.
        dlog(
          `Stack: render route "${route.name}" index=${index}/${state.value.routes.length - 1} ` +
            `activityState=${activityState} at t=${Date.now()}`,
        );

        const routeEmitter = emitterFor(route.key);

        const searchBarOptions = mergedOptions.headerSearchBarOptions;
        const plan = resolveScreenRenderPlan({
          screenId: route.key,
          index,
          routeCount: state.value.routes.length,
          options: mergedOptions,
          platform: NAVIGATOR_PLATFORM,
          isAndroid: Platform.OS === 'android',
          screenPassthrough: {
            [SCREEN_ON_DISMISSED]: () => dispatch({ type: 'pop', count: 1 }),
            [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: () => dispatch({ type: 'pop', count: 1 }),
            // onAppear/onDisappear are the definitive visibility boundary (post-transition-
            // animation), so 'focus'/'blur' fire exactly once per transition; onWillAppear/
            // onWillDisappear fire BEFORE the animation runs, so wiring them to emit() too would
            // double-invoke useFocusEffect per transition - they only get a debug log here.
            [SCREEN_ON_WILL_APPEAR]: () =>
              dlog(`Stack: route "${route.name}" will appear at t=${Date.now()}`),
            [SCREEN_ON_APPEAR]: () => {
              dlog(`Stack: route "${route.name}" appeared (focus) at t=${Date.now()}`);
              routeEmitter.emit(NAVIGATION_EVENT_FOCUS);
            },
            [SCREEN_ON_WILL_DISAPPEAR]: () =>
              dlog(`Stack: route "${route.name}" will disappear at t=${Date.now()}`),
            [SCREEN_ON_DISAPPEAR]: () => {
              dlog(`Stack: route "${route.name}" disappeared (blur) at t=${Date.now()}`);
              routeEmitter.emit(NAVIGATION_EVENT_BLUR);
            },
          },
          searchBarPassthrough: searchBarOptions
            ? {
                ...buildSearchBarPassthrough(searchBarOptions, message =>
                  dlog(`Stack: route "${route.name}" ${message}`),
                ),
                // The imperative ref (SearchBarCommands): a function ref attached straight to the
                // RNSSearchBar host element via `passthrough.ref` - descriptorToVue's h() call
                // hands the raw engine node to a plain function ref same as Switch/TextInput's
                // setNodeRef. Built fresh per mount/unmount, never captured eagerly
                // (buildSearchBarHandle's own lazy-getter contract is satisfied trivially here
                // since `node` is already resolved).
                ref: (el: unknown): void => {
                  const node = isSymbioteNode(el) ? el : null;
                  // Investigation instrumentation (search-bar-ref "node not committed" bug):
                  // compare this debugNodeId against the mirror.set/dispatchViewCommand logs in
                  // commit.ts - same id on both sides proves the ref really does hold the
                  // committed node; a mismatch proves a stale closure instead. Kept behind DEBUG,
                  // never removed.
                  dlog(
                    `Stack: search bar ref callback, node=${node === null ? 'null' : debugNodeId(node)} at t=${Date.now()}`,
                  );
                  const appRef = searchBarOptions.ref;
                  if (appRef === undefined) return;
                  appRef.value = node === null ? null : buildSearchBarHandle(() => node);
                },
              }
            : undefined,
        });
        // Investigation instrumentation (flicker-on-focus bug): the actual timing/z-order-relevant
        // values resolved onto the native RNSScreen, once per route.key (not every render) -
        // rules a stackAnimation/transitionDuration mismatch against react-native-screens' own
        // native default in or out. Kept behind DEBUG, never removed.
        if (!loggedScreenPropKeys.has(route.key)) {
          loggedScreenPropKeys.add(route.key);
          dlog(
            `Stack: route "${route.name}" resolved screen props ` +
              `stackAnimation=${String(plan.screenProps.stackAnimation)} ` +
              `stackPresentation=${String(plan.screenProps.stackPresentation)} ` +
              `transitionDuration=${String(plan.screenProps.transitionDuration)} ` +
              `gestureEnabled=${String(plan.screenProps.gestureEnabled)} at t=${Date.now()}`,
          );
        }

        // Must not be flattened away (collapsable: false) - react-native-screens' native side
        // finds THIS specific view type by class check to register a formSheet's content for
        // sizing (see RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME's comment in core/constants.ts). A
        // `push` screen doesn't need it, but a `formSheet` one is otherwise left with no content
        // ever attached natively.
        const content = h(RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME, plan.contentWrapperProps, [
          h(
            NavigationScope,
            {
              value: {
                route,
                navigation: handle,
                emitter: routeEmitter,
                parent: ambientScopeRef?.value,
              },
            },
            // No route/navigation props: the screen reads both through composables off the
            // NavigationScope provided just above (useRoute / useStackNavigation).
            () => h(entry.component),
          ),
        ]);

        // react-native-screens' own Screen.tsx swaps in a DIFFERENT Fabric component
        // ('RNSModalScreen') for a modally-presented screen - its native updateLayoutMetrics:
        // relies on this exact class to know it must NOT apply Yoga's computed frame (see
        // resolveScreenViewName's comment in core/render-stack.ts). The nested Screen
        // isHeaderInModal adds below is always plain 'RNSScreen': react-native-screens' own inner
        // Screen never carries a presentation prop either, since it exists purely to host the
        // header, not to be modally presented itself.

        // A modal/formSheet screen has no UINavigationController of its own on iOS - nest an
        // inner RNSScreenStack/RNSScreen purely to host the native header bar (see
        // isHeaderInModal's comment in core/render-stack.ts). Skipping this leaves
        // RNSScreenStackHeaderConfig with no navigation controller to attach to, so the header
        // silently never renders.
        return plan.inModal
          ? h(plan.screenViewName, { key: route.key, ...plan.screenProps }, [
              h(RNS_SCREEN_STACK_VIEW_NAME, { style: plan.innerStackStyle }, [
                h(
                  RNS_SCREEN_VIEW_NAME,
                  // activityState mirrors the outer Screen's own value - react-native-screens'
                  // RNSScreen.mm treats an unset/inactive nested screen as not yet pushed,
                  // leaving it parked at its pre-push transition position (off past the bottom
                  // edge) instead of its real, presented frame.
                  { style: plan.innerScreenStyle, activityState: plan.activityState },
                  [descriptorToVue(plan.headerConfig), content],
                ),
              ]),
            ])
          : h(plan.screenViewName, { key: route.key, ...plan.screenProps }, [
              descriptorToVue(plan.headerConfig),
              content,
            ]);
      });

      return h(RNS_SCREEN_STACK_VIEW_NAME, stackProps, children);
    };
  },
  { name: 'Stack', inheritAttrs: false },
);

export const Stack = Object.assign(StackImpl, { Screen });
