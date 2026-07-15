// Stack, the Angular lifecycle half. The route-stack transitions (navigator-state) and the
// options/props folds (screen-options, render-stack) live in @symbiote-native/navigation core,
// shared verbatim with the React/Vue adapters; here Angular supplies the lifecycle - a signal for
// the pushed-route stack, a per-instance counter for route-key generation, push/pop/replace/... as
// plain public methods directly on the class (no `useImperativeHandle`/forwardRef equivalent
// needed: an Angular component instance IS its own "ref", same shape as MatDrawer.open(), reached
// via a template reference variable, e.g. `<Stack #nav>` then `nav.push(...)`; `Stack implements
// INavigatorHandle` so the instance itself is what NavigationScopeDirective hands to
// NavigationContextService - the DI scope every mounted screen reads its navigation/route from via
// injectStackNavigation()/injectRoute(), never a component input) - plus the descriptor bridge for
// the header config leaf via the raw
// native-view element tags below. Pushing/popping a route is an ordinary child render/removal:
// RNSScreenStack diffs its RNSScreen children natively, so no imperative native command is needed
// here at all. Neither this nor ScreenDirective imports react-native-screens' own React components
// (hooks, crashes a non-React adapter); the native views are driven directly through the
// ViewConfig ../register registers. See CLAUDE.md <third_party_rn_packages_are_react_only>.
//
// RAW NATIVE TAGS + NO_ERRORS_SCHEMA: RNSScreenStack/RNSScreen/RNSModalScreen/
// RNSScreenContentWrapper/RNSScreenStackHeaderConfig/RNSScreenStackHeaderSubview/RNSSearchBar are
// react-native-screens' native Fabric views, not Angular components - core's render-stack.ts
// deliberately hands back PLAIN PROPS OBJECTS for the leaves this adapter builds itself with real
// framework children (see its header comment), the same split react/stack.ts's `createElement`
// calls implement. A non-dashed raw tag name only satisfies Angular's DOM element schema check
// under `NO_ERRORS_SCHEMA` (`CUSTOM_ELEMENTS_SCHEMA` only relaxes tags containing a "-", confirmed
// against `.vendors/angular/packages/compiler/src/schema/dom_element_schema_registry.ts`'s
// `hasElement`) - every other Angular component in this codebase only ever names dashed
// `symbiote-*` primitives or real `@Component` selectors, so this is the first legitimate need for
// the looser schema in this codebase; every prop still routes through the real, declared
// `[symbioteHostProps]` input (primitives/shared.ts, `@symbiote-native/angular`), never a bare
// unknown-property binding.
//
// RESOLVED: `Stack` itself (like `Tab`/`Drawer`) is a composed Angular `@Component` used as a
// plain `<Stack>` tag by consuming app code. It is NOT hardcoded into `adapters/angular/src/
// renderer/index.ts`'s `ANCHOR_HOST_COMPONENTS` Set - as an app/package-owned selector it
// self-registers instead: `adapters/angular/babel-register-composed.cjs` (a Metro babel preset
// applied bundle-wide, not scoped to adapters/angular) scans this package's own AOT-compiled
// (`ngc`) `ɵɵngDeclareComponent({selector: 'Stack', ...})` output and auto-calls
// `registerComposedComponent('Stack')` at bundle time - same mechanism `.examples/angular`
// navigation-demo screens and `@symbiote-native/slider`'s `Slider` rely on for their own composed
// components mounted statically or via `NgComponentOutlet`. Unregistered, `createElement('Stack')`
// falls through to a real `createNode` call and RN paints its own "Unimplemented component"
// fallback instead. vitest never runs that Metro/babel pipeline, so `stack.test.ts` calls
// `registerComposedComponent('Stack')` itself. Every raw react-native-screens tag above is
// correctly EXEMPT from this mechanism (they must fall through to a real `createNode` to paint at
// all).

import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  Input,
  NO_ERRORS_SCHEMA,
  QueryList,
  signal,
  type AfterContentInit,
  type OnDestroy,
  type Type,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import { Platform, dlog } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  NAVIGATION_EVENT_STATE,
  RNS_MODAL_SCREEN_VIEW_NAME,
  SCREEN_ON_APPEAR,
  SCREEN_ON_DISAPPEAR,
  SCREEN_ON_DISMISSED,
  SCREEN_ON_HEADER_BACK_BUTTON_CLICKED,
  STACK_ON_FINISH_TRANSITIONING,
  buildSearchBarPassthrough,
  createInitialNavigatorState,
  createNavigationEmitter,
  navigatorReducer,
  resolveHeaderInModalStackStyle,
  resolveScreenRenderPlan,
  resolveStackProps,
} from '../../core';
import type {
  INavigationEmitter,
  INavigatorHandle,
  INavigatorPlatform,
  INavigatorState,
  INavigatorAction,
  IRoute,
  ISearchBarCommands,
  IScreenRenderPlan,
} from '../../core';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { SearchBarRefDirective } from '../search-bar-ref.directive';
import { ScreenDirective } from '../screen.directive';
import type { IAngularScreenOptions, IScreenOptionsArgs } from '../screen.directive';

export type { INavigatorHandle } from '../../core';

// backTitleVisible defaults to `true` on both platforms per the codegen spec's own default - no
// ios/android divergence in v1 scope (mirrors react/stack.ts's own constant exactly).
const NAVIGATOR_PLATFORM: INavigatorPlatform = { defaultHeaderBackTitleVisible: true };

let stackInstanceCounter = 0;

@Component({
  selector: 'Stack',
  standalone: true,
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    NgTemplateOutlet,
    NgComponentOutlet,
    NavigationScopeDirective,
    SearchBarRefDirective,
    SymbioteHostPropsDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as currentState) {
      <RNSScreenStack [symbioteHostProps]="stackHostProps()">
        @for (route of currentState.routes; track route.key; let idx = $index) {
          <ng-container
            [ngTemplateOutlet]="screenTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: idx }"
          />
        }
      </RNSScreenStack>
    }

    <ng-template #screenTpl let-route let-index="index">
      @if (outerScreenIsModal(route, index)) {
        <RNSModalScreen [symbioteHostProps]="screenHostProps(route, index)">
          <ng-container
            [ngTemplateOutlet]="innerTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        </RNSModalScreen>
      } @else {
        <RNSScreen [symbioteHostProps]="screenHostProps(route, index)">
          <ng-container
            [ngTemplateOutlet]="innerTpl"
            [ngTemplateOutletContext]="{ $implicit: route, index: index }"
          />
        </RNSScreen>
      }
    </ng-template>

    <ng-template #innerTpl let-route let-index="index">
      @if (isInModal(route, index)) {
        <RNSScreenStack [symbioteHostProps]="innerStackProps()">
          <RNSScreen [symbioteHostProps]="innerScreenProps(route, index)">
            <ng-container
              [ngTemplateOutlet]="headerAndContentTpl"
              [ngTemplateOutletContext]="{ $implicit: route, index: index }"
            />
          </RNSScreen>
        </RNSScreenStack>
      } @else {
        <ng-container
          [ngTemplateOutlet]="headerAndContentTpl"
          [ngTemplateOutletContext]="{ $implicit: route, index: index }"
        />
      }
    </ng-template>

    <ng-template #headerAndContentTpl let-route let-index="index">
      <RNSScreenStackHeaderConfig [symbioteHostProps]="headerConfigProps(route, index)">
        @if (hasSearchBar(route)) {
          <RNSScreenStackHeaderSubview [symbioteHostProps]="headerSubviewProps">
            <RNSSearchBar
              [symbioteSearchBarRef]="searchBarRef(route)"
              [symbioteHostProps]="searchBarProps(route, index)"
            />
          </RNSScreenStackHeaderSubview>
        }
      </RNSScreenStackHeaderConfig>
      <RNSScreenContentWrapper [symbioteHostProps]="contentWrapperProps(route, index)">
        <ng-container
          [symbioteNavigationScope]="route"
          [navigation]="this"
          [emitter]="emitterFor(route.key)"
        >
          <ng-container *ngComponentOutlet="componentFor(route)" />
        </ng-container>
      </RNSScreenContentWrapper>
    </ng-template>
  `,
})
export class Stack implements AfterContentInit, OnDestroy, INavigatorHandle {
  @ContentChildren(ScreenDirective) private readonly screenChildren!: QueryList<ScreenDirective>;

  @Input() initialRouteName?: string;
  @Input() screenOptions?: IAngularScreenOptions;

  readonly headerSubviewProps: Record<string, unknown> = { type: 'searchBar' };

  private readonly routeIdPrefix = `stack-${(stackInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE ScreenDirective instance, not a snapshot copy of its fields:
  // @ContentChildren's `changes` Observable only fires on a STRUCTURAL change to the query
  // results (screens added/removed/reordered), never when an already-matched instance's own
  // `[options]`/`[component]` binding is merely reassigned a new value - a snapshot copy taken at
  // rebuild time would go stale the instant an app changes e.g. `[options]` on an existing
  // `<ng-template symbioteScreen>` without also adding/removing one. Reading straight off the
  // directive instance means Angular's own ordinary Input binding keeps every field live for free.
  private readonly registry = new Map<string, ScreenDirective>();
  private readonly emitters = new Map<string, INavigationEmitter>();
  // Keyed by `${route.key}:${index}`, cleared on every dispatch: the ~7 template-bound
  // accessors below (outerScreenIsModal/isInModal/screenHostProps/...) all resolve the SAME
  // route+index through planFor per change-detection cycle, so caching here turns ~7 runs of
  // the 14-step resolveScreenRenderPlan chain into 1 per actual state change.
  private readonly planCache = new Map<string, IScreenRenderPlan>();
  private routeSequence = 0;
  private screenChildrenSubscription: { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<INavigatorState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();

  readonly push = (name: string, params?: unknown): void =>
    this.dispatch({ type: 'push', route: this.createRoute(name, params) });
  readonly pop = (count?: number): void => this.dispatch({ type: 'pop', count });
  readonly popToTop = (): void => this.dispatch({ type: 'popToTop' });
  readonly popTo = (key: string): void => this.dispatch({ type: 'popTo', key });
  readonly replace = (name: string, params?: unknown): void =>
    this.dispatch({ type: 'replace', route: this.createRoute(name, params) });
  readonly setParams = (params: unknown, key?: string): void =>
    this.dispatch({ type: 'setParams', key, params });
  readonly reset = (nextState: INavigatorState): void =>
    this.dispatch({ type: 'reset', state: nextState });
  readonly canGoBack = (): boolean => (this.stateSignal()?.routes.length ?? 0) > 1;

  ngAfterContentInit(): void {
    this.rebuildRegistry();
    this.initializeState();
    this.screenChildrenSubscription = this.screenChildren.changes.subscribe(() => {
      this.rebuildRegistry();
    });
  }

  ngOnDestroy(): void {
    this.screenChildrenSubscription?.unsubscribe();
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.screenChildren) {
      this.registry.set(screen.name, screen);
    }
  }

  private initializeState(): void {
    if (this.stateSignal() !== undefined) return;
    const initialRouteName = this.initialRouteName ?? this.registry.keys().next().value;
    if (initialRouteName === undefined) {
      dlog('Stack: no <ng-template symbioteScreen> children registered');
      this.stateSignal.set(
        createInitialNavigatorState({ key: this.routeIdPrefix, name: '', params: undefined }),
      );
      return;
    }
    this.stateSignal.set(
      createInitialNavigatorState(
        this.createRoute(initialRouteName, this.registry.get(initialRouteName)?.initialParams),
      ),
    );
  }

  private createRoute(name: string, params: unknown): IRoute<unknown> {
    this.routeSequence += 1;
    return { key: `${this.routeIdPrefix}-${name}-${this.routeSequence}`, name, params };
  }

  private dispatch(action: INavigatorAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    const next = navigatorReducer(current, action);
    this.planCache.clear();
    this.stateSignal.set(next);
    const liveRouteKeys = new Set(next.routes.map(route => route.key));
    for (const route of next.routes) {
      this.emitterFor(route.key).emit(NAVIGATION_EVENT_STATE, next);
    }
    for (const routeKey of this.emitters.keys()) {
      if (!liveRouteKeys.has(routeKey)) this.emitters.delete(routeKey);
    }
  }

  emitterFor(routeKey: string): INavigationEmitter {
    let emitter = this.emitters.get(routeKey);
    if (!emitter) {
      emitter = createNavigationEmitter();
      this.emitters.set(routeKey, emitter);
    }
    return emitter;
  }

  private mergedOptionsFor(route: IRoute<unknown>): IAngularScreenOptions {
    const entry = this.registry.get(route.name);
    const optionsArgs: IScreenOptionsArgs = { route, navigation: this };
    const own =
      entry === undefined
        ? undefined
        : typeof entry.options === 'function'
          ? entry.options(optionsArgs)
          : entry.options;
    return { ...this.screenOptions, ...own };
  }

  componentFor(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  stackHostProps(): Record<string, unknown> {
    return resolveStackProps({
      passthrough: {
        [STACK_ON_FINISH_TRANSITIONING]: () =>
          dlog(`Stack: onFinishTransitioning at t=${Date.now()}`),
      },
    });
  }

  // Threads a route's merged options through the shared ~14-call resolver sequence (see
  // core/render-stack.ts's resolveScreenRenderPlan) every per-route template method below picks
  // its one field from. Angular has no per-route closure scope the way React's `.map`/Vue's render
  // loop do, so each template-bound method calls this per change-detection cycle - cached below
  // by `${route.key}:${index}` so the ~7 accessors that share a route+index resolve the plan once
  // per actual state change instead of once per template read; `dispatch` clears the cache before
  // recomputing so no stale entry survives a state transition. Screen appear/disappear stay
  // adapter-owned (close over `this.dispatch`/`this.emitterFor`); the search bar passthrough
  // carries no dlog wrapper, unlike React/Vue (see this file's own review notes) - its imperative
  // ref rides a separate directive (searchBarRef/[symbioteSearchBarRef]), not this passthrough map.
  private planFor(route: IRoute<unknown>, index: number): IScreenRenderPlan {
    const cacheKey = `${route.key}:${index}`;
    const cached = this.planCache.get(cacheKey);
    if (cached) return cached;
    const mergedOptions = this.mergedOptionsFor(route);
    const searchBarOptions = mergedOptions.headerSearchBarOptions;
    const plan = resolveScreenRenderPlan({
      screenId: route.key,
      index,
      routeCount: this.stateSignal()?.routes.length ?? 1,
      options: mergedOptions,
      platform: NAVIGATOR_PLATFORM,
      isAndroid: Platform.OS === 'android',
      screenPassthrough: {
        [SCREEN_ON_DISMISSED]: () => this.dispatch({ type: 'pop', count: 1 }),
        [SCREEN_ON_HEADER_BACK_BUTTON_CLICKED]: () => this.dispatch({ type: 'pop', count: 1 }),
        [SCREEN_ON_APPEAR]: () => {
          dlog(`Stack: route "${route.name}" appeared (focus)`);
          this.emitterFor(route.key).emit(NAVIGATION_EVENT_FOCUS);
        },
        [SCREEN_ON_DISAPPEAR]: () => {
          dlog(`Stack: route "${route.name}" disappeared (blur)`);
          this.emitterFor(route.key).emit(NAVIGATION_EVENT_BLUR);
        },
      },
      searchBarPassthrough: searchBarOptions
        ? buildSearchBarPassthrough(searchBarOptions)
        : undefined,
    });
    this.planCache.set(cacheKey, plan);
    return plan;
  }

  outerScreenIsModal(route: IRoute<unknown>, index: number): boolean {
    return this.planFor(route, index).screenViewName === RNS_MODAL_SCREEN_VIEW_NAME;
  }

  isInModal(route: IRoute<unknown>, index: number): boolean {
    return this.planFor(route, index).inModal;
  }

  screenHostProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    return this.planFor(route, index).screenProps;
  }

  innerStackProps(): Record<string, unknown> {
    return { style: resolveHeaderInModalStackStyle() };
  }

  innerScreenProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    const plan = this.planFor(route, index);
    return { style: plan.innerScreenStyle, activityState: plan.activityState };
  }

  contentWrapperProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    return this.planFor(route, index).contentWrapperProps;
  }

  headerConfigProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    return this.planFor(route, index).headerConfig.props;
  }

  hasSearchBar(route: IRoute<unknown>): boolean {
    return this.mergedOptionsFor(route).headerSearchBarOptions !== undefined;
  }

  searchBarRef(route: IRoute<unknown>): { current: ISearchBarCommands | null } | undefined {
    return this.mergedOptionsFor(route).headerSearchBarOptions?.ref;
  }

  searchBarProps(route: IRoute<unknown>, index: number): Record<string, unknown> {
    return this.planFor(route, index).searchBarProps ?? {};
  }
}
