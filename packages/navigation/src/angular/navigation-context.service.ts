// The lifecycle half of the framework-agnostic emitter (../core/navigation-events), Angular's
// twin of react/navigation-context.ts's NavigationContext. React re-scopes a plain Context per
// screen via NavigationContext.Provider; Angular's equivalent of "nearest-provider lookup" is
// hierarchical DI - NavigationScopeDirective (./navigation-scope.directive) re-`providers: [...]`
// a fresh NavigationContextService instance per route, and this service's own constructor injects
// its PARENT instance (`@Optional() @SkipSelf()`), which Angular resolves to the nearest ANCESTOR
// provider automatically - the exact `parent` linked list react/navigation-context.ts builds by
// hand via `ambientContext`. A screen nested inside e.g. a Stack-screen-renders-a-Tab composition
// reaches the enclosing Stack the same way a React screen does: one hop up `parent`.
//
// Every navigator kind a screen might be rendered under; consumers narrow the union themselves
// ('push' in handle picks out a Stack handle) - mirrors react/navigation-context.ts's
// IAnyNavigatorHandle exactly, minus the React-specific import cycle avoidance (Angular's `inject`
// resolves this service by TOKEN, so no circular value import exists here at all - only the
// type-only imports below, erased at compile time).

import { Injectable, inject, signal, type Signal } from '@angular/core';
import type { INavigationEmitter, IRoute, IAnyNavigatorHandle } from '../core';

export type { IAnyNavigatorHandle } from '../core';

// NOT `providedIn: 'root'` - deliberately component-scoped (see CLAUDE.md's design note for this
// package): every NavigationScopeDirective usage re-provides this token, so DI naturally mints one
// instance per route/screen, exactly like a fresh React Context value per screen.
@Injectable()
export class NavigationContextService {
  private readonly ambientParent = inject(NavigationContextService, {
    optional: true,
    skipSelf: true,
  });

  // `route` is the one field that legitimately changes over a mounted screen's lifetime (a
  // setParams call swaps in a new route OBJECT with the same key/name) while the screen itself
  // stays mounted - a plain field would go stale the moment a consumer reads it once (e.g. in a
  // constructor, the natural `inject()` call site). A signal lets `injectRoute()`
  // (./injectors/inject-route) hand back a live, reactive value with zero per-consumer
  // subscription plumbing, matching this
  // package's zoneless/signals-first convention. `navigation`/`emitter` are stable for a screen's
  // whole lifetime, so they stay plain fields - no reactivity needed there.
  private readonly routeSignal = signal<IRoute<unknown> | undefined>(undefined);
  readonly route: Signal<IRoute<unknown> | undefined> = this.routeSignal.asReadonly();

  navigation!: IAnyNavigatorHandle;
  emitter!: INavigationEmitter;

  get parent(): NavigationContextService | undefined {
    return this.ambientParent ?? undefined;
  }

  setRoute(route: IRoute<unknown>): void {
    this.routeSignal.set(route);
  }
}

// Every injectX function (./injectors/*) opens with the same optional-inject-then-throw guard;
// this centralizes it so the "must be used within a screen rendered by..." message stays
// identical everywhere instead of six independently-typed copies. Must be called from an
// injection context, same requirement `inject()` itself has - every call site is the first line
// of an injectX function, which callers already only invoke from their own injection context.
export function requireNavigationContext(injectorName: string): NavigationContextService {
  const context = inject(NavigationContextService, { optional: true });
  if (!context) {
    throw new Error(
      `${injectorName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return context;
}
