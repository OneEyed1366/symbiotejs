// Stack, the React lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the Vue/Angular adapters; here React supplies the lifecycle - useReducer
// for the pushed-route stack, useId + a ref counter for route-key generation, useImperativeHandle
// for the push/pop/replace navigator handle - plus the descriptor bridge for the header config
// leaf. Pushing/popping a route is an ordinary child mount/unmount: RNSScreenStack diffs its
// RNSScreen children natively, so no imperative native command is needed here at all. Neither
// this nor the Screen marker imports react-native-screens' own React components (ScreenStack.tsx
// et al - hooks, crashes a non-React adapter); the native views are driven directly through the
// ViewConfig ../register registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.

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
import { descriptorToReact } from '@symbiote-native/react';
import { Platform, debugNodeId, dlog } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
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
  navigatorReducer,
  resolveScreenRenderPlan,
  resolveStackProps,
} from '../../core';
import type { INavigationEmitter, INavigatorHandle, INavigatorPlatform, IRoute } from '../../core';
import { collectRegistry } from '../collect-registry';
import { NavigationContext } from '../navigation-context';
import { Screen } from '../screen';
import type { IReactScreenOptions, IScreenOptionsArgs, IScreenProps } from '../screen';

export type { INavigatorHandle } from '../../core';

export type IStackProps = {
  initialRouteName?: string;
  screenOptions?: IReactScreenOptions;
  children?: ReactNode;
};

// backTitleVisible defaults to `true` on both platforms per the codegen spec's own default
// (CT.WithDefault<boolean, 'true'>) - no ios/android divergence in v1 scope, so a single constant
// stands in for the per-platform injection point ISliderPlatform-style adapters use elsewhere.
const NAVIGATOR_PLATFORM: INavigatorPlatform = { defaultHeaderBackTitleVisible: true };

type IScreenRegistryEntry = Omit<IScreenProps, 'name'>;

function isScreenElement(child: ReactNode): child is ReactElement<IScreenProps> {
  return isValidElement(child) && child.type === Screen;
}

function resolveScreenOptions(
  entry: IScreenRegistryEntry,
  optionsArgs: IScreenOptionsArgs,
  screenOptions: IReactScreenOptions | undefined,
): IReactScreenOptions {
  const own = typeof entry.options === 'function' ? entry.options(optionsArgs) : entry.options;
  return { ...screenOptions, ...own };
}

const StackImpl = forwardRef<INavigatorHandle, IStackProps>((props, forwardedRef) => {
  // Read BEFORE establishing this Stack's own Context value below - becomes the `parent` link a
  // nested screen's useNavigation().getParent() walks (e.g. this Stack rendered as a Tab screen's
  // content reaches that Tab via this value). undefined when this Stack is the nesting root.
  const ambientContext = useContext(NavigationContext);
  const registry = useMemo(
    () => collectRegistry(props.children, isScreenElement),
    [props.children],
  );
  const routeIdPrefix = useId();
  const routeSequence = useRef(0);
  // One emitter per route.key, keyed exactly like routeSequence's counter is scoped - created
  // lazily the first time a route is rendered, pruned once it's popped off the stack (below).
  const emitters = useRef(new Map<string, INavigationEmitter>()).current;
  // Investigation instrumentation (flicker-on-focus bug): route keys whose resolved
  // transition/animation-timing props have already been logged, so the once-per-mount dump below
  // doesn't spam on every re-render. Kept behind DEBUG, never removed.
  const loggedScreenPropKeys = useRef(new Set<string>()).current;

  const emitterFor = useCallback(
    (routeKey: string): INavigationEmitter => {
      let emitter = emitters.get(routeKey);
      if (!emitter) {
        emitter = createNavigationEmitter();
        emitters.set(routeKey, emitter);
      }
      return emitter;
    },
    [emitters],
  );

  const createRoute = useCallback(
    (name: string, params: unknown): IRoute<unknown> => {
      routeSequence.current += 1;
      return { key: `${routeIdPrefix}-${name}-${routeSequence.current}`, name, params };
    },
    [routeIdPrefix],
  );

  const [state, dispatch] = useReducer(navigatorReducer, undefined, () => {
    const initialRouteName = props.initialRouteName ?? registry.keys().next().value;
    if (initialRouteName === undefined) {
      dlog('Stack: no <Stack.Screen> children registered');
      return createInitialNavigatorState({ key: routeIdPrefix, name: '', params: undefined });
    }
    return createInitialNavigatorState(
      createRoute(initialRouteName, registry.get(initialRouteName)?.initialParams),
    );
  });

  const handle = useMemo<INavigatorHandle>(
    () => ({
      push: (name, params) => dispatch({ type: 'push', route: createRoute(name, params) }),
      pop: count => dispatch({ type: 'pop', count }),
      popToTop: () => dispatch({ type: 'popToTop' }),
      popTo: key => dispatch({ type: 'popTo', key }),
      replace: (name, params) => dispatch({ type: 'replace', route: createRoute(name, params) }),
      setParams: (params, key) => dispatch({ type: 'setParams', key, params }),
      reset: nextState => dispatch({ type: 'reset', state: nextState }),
      canGoBack: () => state.routes.length > 1,
    }),
    [createRoute, state.routes.length],
  );

  useImperativeHandle(forwardedRef, () => handle, [handle]);

  // Broadcasts the router state to every still-live route's emitter (useNavigationState's
  // source) after each commit, and prunes emitters for routes popped off the stack - mirroring
  // React's own subscribe-in-effect pattern rather than emitting mid-render, which would call a
  // descendant's setState while this component is still rendering.
  useEffect(() => {
    for (const route of state.routes) {
      emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, state);
    }
    for (const routeKey of emitters.keys()) {
      if (!state.routes.some(route => route.key === routeKey)) emitters.delete(routeKey);
    }
  }, [state, emitterFor, emitters]);

  // Investigation instrumentation (flicker-on-focus bug): STACK_ON_FINISH_TRANSITIONING is the
  // native signal that the WHOLE push/pop animation has finished (as opposed to onAppear/
  // onDisappear, which are per-screen) - logging it lets the per-screen appear/disappear
  // timestamps above be checked against the actual transition-complete moment. Kept behind
  // DEBUG, never removed.
  const stackProps = resolveStackProps({
    passthrough: {
      [STACK_ON_FINISH_TRANSITIONING]: () =>
        dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
    },
  });

  const children = state.routes.map((route, index) => {
    const entry = registry.get(route.name);
    if (!entry) {
      dlog(`Stack: no screen registered for route name "${route.name}"`);
      return null;
    }

    const screenOptionsArgs: IScreenOptionsArgs = { route, navigation: handle };
    const mergedOptions = resolveScreenOptions(entry, screenOptionsArgs, props.screenOptions);
    const activityState = computeActivityState(index, state.routes.length);
    // Investigation instrumentation (flicker-on-focus bug): fires on EVERY Stack render, not just
    // on transitions, so the log stream shows whether a route's activityState/index ever changes
    // outside of a push/pop dispatch (e.g. from an unrelated re-render racing the native
    // transition). Kept behind DEBUG per <keep_logs_gate_behind_DEBUG> - never remove.
    dlog(
      `Stack: render route "${route.name}" index=${index}/${state.routes.length - 1} ` +
        `activityState=${activityState} at t=${Date.now()}`,
    );

    const routeEmitter = emitterFor(route.key);

    const searchBarOptions = mergedOptions.headerSearchBarOptions;
    const plan = resolveScreenRenderPlan({
      screenId: route.key,
      index,
      routeCount: state.routes.length,
      options: mergedOptions,
      platform: NAVIGATOR_PLATFORM,
      isAndroid: Platform.OS === 'android',
      screenPassthrough: {
        [SCREEN_ON_DISMISSED]: () => dispatch({ type: 'pop', count: 1 }),
        [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: () => dispatch({ type: 'pop', count: 1 }),
        // onAppear/onDisappear are the definitive visibility boundary (post-transition-animation),
        // so 'focus'/'blur' fire exactly once per transition; onWillAppear/onWillDisappear fire
        // BEFORE the animation runs, so wiring them to emit() too would double-invoke
        // useFocusEffect per transition - they only get a debug log here.
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
            // The imperative ref (SearchBarCommands): a callback ref attached straight to the
            // RNSSearchBar host element via `passthrough.ref` - createElement extracts `ref` from
            // a props object same as ScrollView/TextInput's own ref binding (see
            // descriptor-to-react's comment), so the host instance IS the ISymbioteNode. Built
            // fresh per mount/unmount, never captured eagerly (buildSearchBarHandle's own
            // lazy-getter contract is satisfied trivially here since `node` is already resolved).
            ref: (node: ISymbioteNode | null) => {
              // Investigation instrumentation (search-bar-ref "node not committed" bug): compare
              // this debugNodeId against the mirror.set/dispatchViewCommand logs in commit.ts -
              // same id on both sides proves the ref really does hold the committed node; a
              // mismatch proves a stale closure instead. Kept behind DEBUG, never removed.
              dlog(
                `Stack: search bar ref callback, node=${node === null ? 'null' : debugNodeId(node)} at t=${Date.now()}`,
              );
              const appRef = searchBarOptions.ref;
              if (!appRef) return;
              appRef.current = node === null ? null : buildSearchBarHandle(() => node);
            },
          }
        : undefined,
    });
    // Investigation instrumentation (flicker-on-focus bug): the actual timing/z-order-relevant
    // values resolved onto the native RNSScreen, once per route.key (not every render) - rules a
    // stackAnimation/transitionDuration mismatch against react-native-screens' own native default
    // in or out. Kept behind DEBUG, never removed.
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
    const content = createElement(
      RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME,
      plan.contentWrapperProps,
      createElement(
        NavigationContext.Provider,
        { value: { route, navigation: handle, emitter: routeEmitter, parent: ambientContext } },
        createElement(entry.component),
      ),
    );

    // react-native-screens' own Screen.tsx swaps in a DIFFERENT Fabric component
    // ('RNSModalScreen') for a modally-presented screen - its native updateLayoutMetrics: relies on
    // this exact class to know it must NOT apply Yoga's computed frame (see resolveScreenViewName's
    // comment in core/render-stack.ts). The nested Screen isHeaderInModal adds below is always
    // plain 'RNSScreen': react-native-screens' own inner Screen never carries a presentation prop
    // either, since it exists purely to host the header, not to be modally presented itself.

    // A modal/formSheet screen has no UINavigationController of its own on iOS - nest an inner
    // RNSScreenStack/RNSScreen purely to host the native header bar (see isHeaderInModal's
    // comment in core/render-stack.ts). Skipping this leaves RNSScreenStackHeaderConfig with no
    // navigation controller to attach to, so the header silently never renders.
    return plan.inModal
      ? createElement(
          plan.screenViewName,
          { key: route.key, ...plan.screenProps },
          createElement(
            RNS_SCREEN_STACK_VIEW_NAME,
            { style: plan.innerStackStyle },
            createElement(
              RNS_SCREEN_VIEW_NAME,
              // activityState mirrors the outer Screen's own value - react-native-screens'
              // RNSScreen.mm treats an unset/inactive nested screen as not yet pushed, leaving it
              // parked at its pre-push transition position (off past the bottom edge) instead of
              // its real, presented frame.
              { style: plan.innerScreenStyle, activityState: plan.activityState },
              descriptorToReact(plan.headerConfig),
              content,
            ),
          ),
        )
      : createElement(
          plan.screenViewName,
          { key: route.key, ...plan.screenProps },
          descriptorToReact(plan.headerConfig),
          content,
        );
  });

  return createElement(RNS_SCREEN_STACK_VIEW_NAME, stackProps, ...children);
});

export const Stack = Object.assign(StackImpl, { Screen });
