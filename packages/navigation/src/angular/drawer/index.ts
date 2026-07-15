// Drawer, the Angular lifecycle half. The open/closed + focused-route router
// (drawer-router-state) and the pure swipe/geometry math (drawer-options) live in
// @symbiote-native/navigation core, shared verbatim with the React/Vue adapters; here Angular
// supplies the lifecycle - a signal-backed router, a PanResponder (RN's own idiom, framework-
// agnostic per `@symbiote-native/engine` - built ONCE as a class field, callbacks read LIVE `this`
// state at call time, no ref-mirroring dance needed the way react/drawer.ts's `useRef`s are: a
// class instance already gives every callback a live view of current state, closing the exact gap
// React's own hook rules force it to work around), an Animated.Value driving the slide/opacity
// transforms via the real `AnimatedView` component (`@symbiote-native/angular`), and
// `openDrawer`/`closeDrawer`/`toggleDrawer`/`jumpTo` as plain public methods directly on the class,
// mirroring tabs.ts's shape (Tab is the closer sibling: both are fixed-route-list,
// no-react-native-screens navigators; Stack's push/pop + native-screen bridging don't apply here;
// `Drawer implements IDrawerNavigatorHandle`).
//
// FEASIBILITY NOTE (mirrors react/drawer.ts's own header): the REAL @react-navigation/drawer is
// built on react-native-gesture-handler + react-native-reanimated, neither of which this codebase
// depends on. This reaches the same swipe-to-open/close + front/back/slide/permanent behavior with
// only PanResponder + Animated, sufficient for a solid drawer but NOT byte-for-byte parity - same
// explicit gap list as react/drawer.ts's tail comment (not repeated here, nothing Angular-specific
// changes it).
//
// RESOLVED (see stack.ts's header, identical reasoning): `'Drawer'` has an `ANCHOR_HOST_COMPONENTS`
// entry in `adapters/angular/src/renderer.ts`, so a real device build paints `<Drawer>` correctly
// as a nested tag. `View`/`AnimatedView`, imported below, were already anchor-hosted.
//
// DRAWER CONTENT PROJECTION: react/drawer.ts's `renderDrawerContent` is a render-PROP callback
// (`(props) => ReactNode`) - per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter>, a
// render-callback returning a framework element is inherently per-adapter. Angular's own idiom for
// "a caller-supplied template that needs live data" is a `TemplateRef` + `NgTemplateOutlet` with a
// context object, NOT a callback @Input(): `<Drawer><ng-template #drawerContent let-ctx>...
// {{ ctx.state }}...</ng-template></Drawer>`, read here via `@ContentChild('drawerContent', {read:
// TemplateRef})`.

import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ContentChildren,
  Input,
  QueryList,
  TemplateRef,
  computed,
  inject,
  signal,
  untracked,
  type AfterContentInit,
  type OnChanges,
  type OnDestroy,
  type Type,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import {
  PanResponder,
  dlog,
  flattenStyle,
  type IPanResponderGestureState,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  Animated,
  AnimatedView,
  SymbioteHostPropsDirective,
  View,
  WindowDimensionsService,
} from '@symbiote-native/angular';
import type { IDescriptor, IDescriptorChild } from '@symbiote-native/components';
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
  IDrawerRouterAction,
  IDrawerRouterState,
  IDrawerScreenOptions,
  IDrawerSlot,
  IDrawerType,
  INavigationEmitter,
  IRoute,
} from '../../core';
import { NavigationScopeDirective } from '../navigation-scope.directive';
import { DrawerScreenDirective } from '../drawer-screen.directive';
import type { IDrawerScreenOptionsArgs } from '../drawer-screen.directive';

export type { IDrawerNavigatorHandle, IDrawerDescriptorMap } from '../../core';

export type IDrawerContentContext = {
  $implicit: {
    state: IDrawerRouterState;
    descriptors: IDrawerDescriptorMap;
    navigation: IDrawerNavigatorHandle;
  };
};

const DRAWER_SNAP_DURATION = 250;

let drawerInstanceCounter = 0;

@Component({
  selector: 'Drawer',
  standalone: true,
  imports: [
    NgComponentOutlet,
    NgTemplateOutlet,
    NavigationScopeDirective,
    SymbioteHostPropsDirective,
    View,
    AnimatedView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as currentState) {
      <View [style]="rootStyle()" [symbioteHostProps]="rootPanHandlers()">
        @for (slot of slotOrder(); track slot) {
          @switch (slot) {
            @case ('content') {
              <AnimatedView [style]="contentStyle()" [animatedProps]="slotAnimatedProps('content')">
                @if (focusedRoute(); as route) {
                  @if (componentForRoute(route); as component) {
                    <ng-container
                      [symbioteNavigationScope]="route"
                      [navigation]="this"
                      [emitter]="focusedRouteEmitter()"
                    >
                      <ng-container *ngComponentOutlet="component" />
                    </ng-container>
                  }
                }
              </AnimatedView>
            }
            @case ('overlay') {
              <AnimatedView
                [style]="overlayStyle()"
                [animatedProps]="slotAnimatedProps('overlay')"
              />
            }
            @case ('panel') {
              <AnimatedView [style]="panelStyle()" [animatedProps]="slotAnimatedProps('panel')">
                @if (drawerContentTemplate) {
                  <ng-container
                    *ngTemplateOutlet="
                      drawerContentTemplate;
                      context: drawerContentContext(currentState)
                    "
                  />
                }
              </AnimatedView>
            }
          }
        }
      </View>
    }
  `,
})
export class Drawer implements AfterContentInit, OnChanges, OnDestroy, IDrawerNavigatorHandle {
  @ContentChildren(DrawerScreenDirective)
  private readonly drawerScreenChildren!: QueryList<DrawerScreenDirective>;
  @ContentChild('drawerContent', { read: TemplateRef })
  drawerContentTemplate?: TemplateRef<IDrawerContentContext>;

  @Input() initialRouteName?: string;
  @Input() drawerStyle?: IStyleProp<IViewStyle>;
  @Input() drawerType?: IDrawerType;
  @Input() drawerPosition?: IDrawerPosition;
  @Input() drawerWidth?: number;
  @Input() overlayColor?: string;
  @Input() swipeEnabled?: boolean;
  @Input() swipeEdgeWidth?: number;
  @Input() swipeMinDistance?: number;
  @Input() swipeMinVelocity?: number;

  private readonly windowDimensions = inject(WindowDimensionsService).dimensions;

  private readonly routeIdPrefix = `drawer-${(drawerInstanceCounter += 1)}`;
  // Keyed by name -> the LIVE DrawerScreenDirective instance - see stack.ts's matching comment
  // for why a snapshot copy would go stale on an in-place `[options]`/`[component]` change.
  private readonly registry = new Map<string, DrawerScreenDirective>();
  private drawerScreenChildrenSubscription: { unsubscribe: () => void } | undefined;

  private readonly stateSignal = signal<IDrawerRouterState | undefined>(undefined);
  readonly state = this.stateSignal.asReadonly();

  private currentEmitterKey: string | undefined;
  private currentEmitter: INavigationEmitter | undefined;

  // progress: 0 closed -> 1 open. Always starts closed (createInitialDrawerRouterState's own
  // contract), so a plain field initializer is safe - no dependency on `state` existing yet.
  private readonly progress = new Animated.Value(0);
  // Where a drag STARTS from, in progress units - always exactly 0 or 1 (see react/drawer.ts's
  // matching field for why).
  private dragStartProgress = 0;

  readonly openDrawer = (): void => {
    this.animateProgressTo(true);
    this.dispatch({ type: 'openDrawer' });
  };
  readonly closeDrawer = (): void => {
    this.animateProgressTo(false);
    this.dispatch({ type: 'closeDrawer' });
  };
  readonly toggleDrawer = (): void => {
    this.animateProgressTo(!(this.stateSignal()?.isOpen ?? false));
    this.dispatch({ type: 'toggleDrawer' });
  };
  readonly jumpTo = (name: string): void => {
    // Captured BEFORE dispatch, mirroring vue/drawer/index.ts's jumpTo: a signal (like Vue's ref)
    // mutates synchronously inside dispatch, so reading isOpen after it would already see the
    // reducer's own isOpen: false and never animate the panel closed.
    const wasOpen = this.stateSignal()?.isOpen ?? false;
    this.dispatch({ type: 'jumpTo', name });
    if (wasOpen) this.animateProgressTo(false);
  };

  readonly panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (
      event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        this.windowDimensions().width,
        this.stateSignal()?.isOpen ?? false,
        this.optionsSnapshot(),
        'start',
      ),
    onMoveShouldSetPanResponder: (
      event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): boolean =>
      shouldClaimDrawerSwipe(
        event,
        gestureState,
        this.windowDimensions().width,
        this.stateSignal()?.isOpen ?? false,
        this.optionsSnapshot(),
        'move',
      ),
    onPanResponderGrant: (): void => {
      dlog('Drawer: gesture grant');
      this.dragStartProgress = (this.stateSignal()?.isOpen ?? false) ? 1 : 0;
    },
    onPanResponderMove: (_event: ISymbioteEvent, gestureState: IPanResponderGestureState): void => {
      this.progress.setValue(
        resolveDragProgress(gestureState, this.dragStartProgress, this.optionsSnapshot()),
      );
    },
    onPanResponderRelease: (
      _event: ISymbioteEvent,
      gestureState: IPanResponderGestureState,
    ): void => {
      const intent = resolveSwipeIntent(
        gestureState,
        this.stateSignal()?.isOpen ?? false,
        this.optionsSnapshot(),
      );
      const open = intent === 'open';
      dlog(`Drawer: gesture release -> ${open ? 'open' : 'close'}`);
      this.animateProgressTo(open);
      this.dispatch(open ? { type: 'openDrawer' } : { type: 'closeDrawer' });
    },
    onPanResponderTerminate: (): void => {
      dlog('Drawer: gesture terminated, snapping back');
      this.animateProgressTo(this.stateSignal()?.isOpen ?? false);
    },
  });

  ngAfterContentInit(): void {
    this.rebuildRegistry();
    this.initializeState();
    this.drawerScreenChildrenSubscription = this.drawerScreenChildren.changes.subscribe(() => {
      this.rebuildRegistry();
    });
  }

  ngOnDestroy(): void {
    this.drawerScreenChildrenSubscription?.unsubscribe();
    if (this.currentEmitter) this.currentEmitter.emit(NAVIGATION_EVENT_BLUR);
  }

  private rebuildRegistry(): void {
    this.registry.clear();
    for (const screen of this.drawerScreenChildren) {
      this.registry.set(screen.name, screen);
    }
  }

  private routesFromRegistry(): IRoute<unknown>[] {
    return Array.from(this.registry.entries()).map(([name, entry]) => ({
      key: `${this.routeIdPrefix}-${name}`,
      name,
      params: entry.initialParams,
    }));
  }

  private initializeState(): void {
    if (this.stateSignal() !== undefined) return;
    const routes = this.routesFromRegistry();
    if (routes.length === 0)
      dlog('Drawer: no <ng-template symbioteDrawerScreen> children registered');
    this.stateSignal.set(createInitialDrawerRouterState(routes, this.initialRouteName));
  }

  private dispatch(action: IDrawerRouterAction): void {
    const current = this.stateSignal();
    if (current === undefined) return;
    this.stateSignal.set(drawerRouterReducer(current, action));
  }

  private animateProgressTo(open: boolean): void {
    dlog(`Drawer: animateProgressTo(open=${open})`);
    Animated.timing(this.progress, {
      toValue: open ? 1 : 0,
      duration: DRAWER_SNAP_DURATION,
      // Native-driver wiring is deferred for v1 - mirrors react/drawer.ts's own scope note.
      useNativeDriver: false,
    }).start();
  }

  // A plain writable signal, not a computed() - it mirrors @Input() properties, which are ordinary
  // mutable fields Angular assigns directly rather than signals, so a computed() reading them would
  // never register them as a tracked dependency and would go stale after its first evaluation.
  // ngOnChanges (below) pushes every input change in here instead, which drawerRoot/slotsMap CAN
  // track correctly since reading a signal (unlike a plain field) IS visible to computed()'s
  // dependency collection.
  private readonly optionsSnapshot = signal<IDrawerOptions>(this.buildOptionsSnapshot());
  private readonly drawerStyleSnapshot = signal<IStyleProp<IViewStyle> | undefined>(
    this.drawerStyle,
  );

  ngOnChanges(): void {
    this.optionsSnapshot.set(this.buildOptionsSnapshot());
    this.drawerStyleSnapshot.set(this.drawerStyle);
  }

  private buildOptionsSnapshot(): IDrawerOptions {
    return {
      drawerType: this.drawerType,
      drawerPosition: this.drawerPosition,
      drawerWidth: this.drawerWidth,
      overlayColor: this.overlayColor,
      swipeEnabled: this.swipeEnabled,
      swipeEdgeWidth: this.swipeEdgeWidth,
      swipeMinDistance: this.swipeMinDistance,
      swipeMinVelocity: this.swipeMinVelocity,
    };
  }

  private overlayResponderPassthrough(): Record<string, unknown> {
    return {
      pointerEvents: this.stateSignal()?.isOpen ? 'auto' : 'none',
      onStartShouldSetResponder: () => true,
      onResponderRelease: () => {
        this.animateProgressTo(false);
        this.dispatch({ type: 'closeDrawer' });
      },
    };
  }

  // Recomputed only when a dependency signal actually changes, so every template read within a
  // single change-detection pass (rootStyle, plus slotStyle/slotAnimatedProps once per @for slot -
  // 6-7 reads total) shares one cached descriptor tree instead of re-running renderDrawer /
  // drawerChildOrder on each read.
  private readonly drawerRoot = computed<IDescriptor>(() =>
    renderDrawer(
      {
        overlayColor: this.optionsSnapshot().overlayColor ?? DRAWER_DEFAULT_OVERLAY_COLOR,
        drawerStyle: this.drawerStyleSnapshot(),
        contentPassthrough: {},
        overlayPassthrough: this.isAnimated() ? this.overlayResponderPassthrough() : {},
        panelPassthrough: {},
      },
      this.optionsSnapshot(),
    ),
  );

  private readonly slotsMap = computed<Map<IDrawerSlot, IDescriptor>>(() => {
    const root = this.drawerRoot();
    const order = drawerChildOrder(this.optionsSnapshot());
    const map = new Map<IDrawerSlot, IDescriptor>();
    order.forEach((slot, index) => {
      const child: IDescriptorChild | undefined = root.children[index];
      if (child !== undefined && typeof child !== 'string') map.set(slot, child);
    });
    return map;
  });

  isAnimated(): boolean {
    return isDrawerAnimated(this.optionsSnapshot());
  }

  slotOrder(): readonly IDrawerSlot[] {
    return drawerChildOrder(this.optionsSnapshot());
  }

  rootStyle(): Record<string, unknown> {
    return flattenStyle(this.drawerRoot().props.style);
  }

  rootPanHandlers(): Record<string, unknown> {
    return { ...this.panResponder.panHandlers };
  }

  slotAnimatedProps(slot: IDrawerSlot): Record<string, unknown> {
    const descriptor = this.slotsMap().get(slot);
    if (!descriptor) return {};
    const { style: _style, ...rest } = descriptor.props;
    return rest;
  }

  private slotStyle(
    slot: IDrawerSlot,
    animatedStyle: () => Record<string, unknown>,
  ): Record<string, unknown> {
    const base = this.slotsMap().get(slot)?.props.style;
    return this.isAnimated() ? flattenStyle([base, animatedStyle()]) : flattenStyle(base);
  }

  contentStyle(): Record<string, unknown> {
    return this.slotStyle('content', () => {
      const g = resolveDrawerGeometry(this.optionsSnapshot());
      const { translateX } = resolveDrawerSlotInterpolation(g, 'content');
      return {
        transform: [{ translateX: this.progress.interpolate(translateX) }],
      };
    });
  }

  // The overlay's translateX follows content's own delta (see render-drawer.ts's comment on
  // `overlayTranslateX`): for `slide`, content itself moves away, and without the overlay
  // following it the dimming stays pinned full-screen instead of tracking the revealed panel.
  overlayStyle(): Record<string, unknown> {
    return this.slotStyle('overlay', () => {
      const g = resolveDrawerGeometry(this.optionsSnapshot());
      const { opacity, translateX } = resolveDrawerSlotInterpolation(g, 'overlay');
      return {
        opacity: this.progress.interpolate(opacity),
        transform: [{ translateX: this.progress.interpolate(translateX) }],
      };
    });
  }

  panelStyle(): Record<string, unknown> {
    return this.slotStyle('panel', () => {
      const g = resolveDrawerGeometry(this.optionsSnapshot());
      const { translateX } = resolveDrawerSlotInterpolation(g, 'panel');
      return {
        transform: [{ translateX: this.progress.interpolate(translateX) }],
      };
    });
  }

  focusedRoute(): IRoute<unknown> | undefined {
    const state = this.stateSignal();
    return state?.routes[state.index];
  }

  componentForRoute(route: IRoute<unknown>): Type<unknown> | null {
    return this.registry.get(route.name)?.component ?? null;
  }

  private resolveDrawerScreenOptions(
    entry: DrawerScreenDirective,
    route: IRoute<unknown>,
  ): IDrawerScreenOptions {
    if (typeof entry.options === 'function') {
      const props: IDrawerScreenOptionsArgs = { route, navigation: this };
      return entry.options(props);
    }
    return entry.options ?? {};
  }

  // Lazily creates/replaces the focused route's emitter and synthesizes focus/blur - Drawer paints
  // its own panel in pure JS (no native onAppear/onDisappear the way Stack's RNSScreen has), so
  // focus/blur is synthesized here exactly like react/drawer.ts's own useEffect does, just
  // idempotent per read instead of dependency-array gated. Keyed on the route KEY, not the object,
  // so a no-op re-focus of the already-focused route doesn't spuriously re-fire.
  //
  // Called from the template ([emitter]="focusedRouteEmitter()"), which runs inside Angular's
  // reactive-read tracking context for the current CD pass - unlike React's useEffect, which runs
  // in a separate post-commit phase. Two consequences of that, both fixed below (see tabs.ts's
  // identical fix for the full mechanism):
  //
  // 1. Writing a signal from inside a tracked template read throws Angular's NG600 ("signal write
  //    during a template execution") - untracked() opts this whole synthesis out of that
  //    tracking context.
  // 2. The NEW route's screen component (injectIsFocused's listener source) is created by
  //    *ngComponentOutlet AFTER this binding is evaluated but still within the SAME synchronous
  //    template refresh - emitting FOCUS right here fires to zero listeners and is silently lost
  //    forever. queueMicrotask defers the FOCUS emit past the end of the current refresh
  //    (including the new screen's construction). BLUR doesn't need this: the outgoing screen's
  //    listener was already attached on an earlier tick.
  focusedRouteEmitter(): INavigationEmitter {
    const key = this.focusedRoute()?.key;
    return untracked(() => {
      if (key === this.currentEmitterKey && this.currentEmitter) return this.currentEmitter;
      const { blurKey, focusKey } = diffFocusedRoute(this.currentEmitterKey, key);
      if (blurKey !== undefined && this.currentEmitter) {
        dlog('Drawer: previous route blurred');
        this.currentEmitter.emit(NAVIGATION_EVENT_BLUR);
      }
      const emitter = createNavigationEmitter();
      this.currentEmitter = emitter;
      this.currentEmitterKey = key;
      if (focusKey !== undefined) {
        queueMicrotask(() => {
          if (this.currentEmitter !== emitter) return; // superseded by a later switch
          dlog(`Drawer: route "${this.focusedRoute()?.name}" focused`);
          emitter.emit(NAVIGATION_EVENT_FOCUS);
        });
      }
      return emitter;
    });
  }

  drawerContentContext(currentState: IDrawerRouterState): IDrawerContentContext {
    const descriptors: IDrawerDescriptorMap = {};
    for (const route of currentState.routes) {
      const entry = this.registry.get(route.name);
      if (entry === undefined) continue;
      descriptors[route.key] = {
        options: this.resolveDrawerScreenOptions(entry, route),
        navigation: this,
      };
    }
    return { $implicit: { state: currentState, descriptors, navigation: this } };
  }
}
