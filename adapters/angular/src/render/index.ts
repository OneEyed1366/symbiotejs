// Mount an Angular app onto a Fabric surface. The native host hands us a rootTag; we
// create a surface and bootstrap a standalone Angular component WITHOUT platform-browser
// (no DOM) — createEnvironmentInjector + createComponent over @angular/core only, with our
// SymbioteRendererFactory provided so Angular drives the engine, which commits into
// nativeFabricUIManager; RN's own renderer never in the path. Angular twin of
// adapters/vue/src/render.ts.

import {
  createElement as createEngineElement,
  createSurface,
  disposeRoot,
  dlog,
  toPublicInstance,
  type ISymbioteNode,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import {
  ApplicationRef,
  createComponent,
  createEnvironmentInjector,
  DOCUMENT,
  ErrorHandler,
  RendererFactory2,
  ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
  ɵprovideZonelessChangeDetectionInternal as provideZonelessChangeDetectionInternal,
  type ComponentRef,
  type EnvironmentInjector,
  type Type,
} from '@angular/core';
import { SymbioteRendererFactory } from '../renderer';
import { ColorSchemeService, WindowDimensionsService } from '../services';

// The two FFI-edge casts of this adapter, both confined here to bootstrap. Angular's core
// types model a browser: the injector parent is a non-null EnvironmentInjector, the host is
// a DOM Element. Our root has neither shape — a null parent IS a root injector, and the host
// is a SymbioteSurface (or, for a wrapped AppRegistry root, a plain engine node) the
// SymbioteRenderer (not the DOM) consumes. These are the sanctioned I/O-edge casts where our
// objects cross into Angular's web-typed API; revisit if Angular ever exposes a cast-free
// host. Nothing else in the adapter casts.
function rootInjectorParent(): EnvironmentInjector {
  return null as unknown as EnvironmentInjector;
}
function asAngularHost(hostNode: SymbioteSurface | ISymbioteNode): Element {
  // Angular's locateHostElement reads hostElement.tagName even when a concrete hostElement
  // is supplied. The host container is given Angular the tiny DOM-shaped field it probes
  // without changing the renderer target.
  Object.defineProperty(hostNode, 'tagName', {
    configurable: true,
    value: 'symbiote-root',
  });
  return hostNode as unknown as Element;
}

// A bare `symbiote-view` node, created directly through the engine (bypassing Angular's own
// createElement, which only resolves KNOWN symbiote primitives, never an arbitrary component's
// selector — see SymbioteRenderer.createElement). Used as the AppRegistry root's host when a
// wrapperComponentProvider is set: Angular has no hostElement-less bootstrap for our renderer
// (it would try `renderer.createElement(rootComponent.selector)`, which throws for anything
// that isn't one of our primitives), so the root needs an explicit host too, one we then hand
// to the wrapper as projectable content.
function createDetachedViewHost(): ISymbioteNode {
  const descriptor = descriptorFor('View');
  return toPublicInstance(createEngineElement(descriptor.component, descriptor.isText));
}

interface IMountedApp {
  cmpRef: ComponentRef<unknown>;
  rootRef: ComponentRef<unknown> | undefined;
  injector: EnvironmentInjector;
}

// AppRegistry's `wrapperComponentProvider` support: the root renders detached (Angular gives
// it its own host node via our renderer, not yet attached anywhere), and the wrapper — the
// component actually attached to the surface — receives that host node as a projected child.
// `<ng-content>` in the wrapper's template is the Angular idiom for "render my children", the
// direct twin of React's `createElement(Wrapper, null, rootElement)`.
export interface IMountOptions {
  initialProps?: object;
  wrapperComponent?: Type<unknown>;
}

function applyInputs(cmpRef: ComponentRef<unknown>, initialProps: object | undefined): void {
  if (initialProps === undefined) return;
  for (const [key, value] of Object.entries(initialProps)) {
    cmpRef.setInput(key, value);
  }
}

// One Angular app per surface, so a surface can be torn down (unmount) or cleanly
// re-mounted on the same rootTag: the bridgeless host stops and restarts a surface on Fast
// Refresh and on lifecycle/focus changes, reusing the rootTag.
const apps = new Map<IRootTag, IMountedApp>();

function teardown(rootTag: IRootTag): void {
  const app = apps.get(rootTag);
  if (app === undefined) return;
  app.rootRef?.destroy();
  app.cmpRef.destroy();
  app.injector.destroy();
  apps.delete(rootTag);
  disposeRoot(rootTag);
}

export function mount(
  rootTag: IRootTag,
  rootComponent: Type<unknown>,
  options?: IMountOptions,
): SymbioteSurface {
  // A re-mount on a live rootTag starts clean; otherwise the stale app double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);
  const injector = createEnvironmentInjector(
    [
      {
        provide: RendererFactory2,
        useValue: new SymbioteRendererFactory(surface),
      },
      { provide: DOCUMENT, useValue: { head: surface, body: surface } },
      // createEnvironmentInjector with a null parent gives this injector scope
      // {'environment'} only (see EnvironmentNgModuleRefAdapter), so providedIn:'root'
      // tokens — ApplicationRef included — never resolve on their own (R3Injector.get
      // walks up looking for an injector whose `scopes` contains 'root', and a null
      // parent means that search always dead-ends in NullInjector). platform-browser's
      // BROWSER_MODULE_PROVIDERS solves this the same way for real DOM apps: it hands
      // { provide: INJECTOR_SCOPE, useValue: 'root' } to its OWN app-level providers, and
      // R3Injector's constructor reads that provider and self-tags this.scopes with
      // 'root'. We do the same here — no PlatformRef, no DOM, just this one provider.
      { provide: INJECTOR_SCOPE, useValue: 'root' },
      // Supplies the real ChangeDetectionSchedulerImpl (microtask-batched, self-scheduling
      // via ApplicationRef.afterTick) + NoopNgZone + ZONELESS_ENABLED: true — the exact
      // bundle internalCreateApplication() uses. With ApplicationRef reachable (see above),
      // there is no more reason for a hand-rolled scheduler: it replaces our old
      // unconditional `rootView.detectChanges(); cmpView.detectChanges()` (which force-ran
      // BOTH root views on every tick regardless of cause) with Angular's own tick(), which
      // only enters an attached view when something actually marked it (RefreshView / Dirty
      // consumer / HasChildViewsToRefresh). NOTE: this does NOT stop the root's own template
      // from re-running on a plain press or `ChangeDetectorRef.markForCheck()` anywhere in
      // the tree — `markViewDirty` (which both native (event) bindings and `markForCheck()`
      // go through, see SymbioteHostPropsDirective) unconditionally sets RefreshView on
      // EVERY ancestor up to the root; that is fundamental, unavoidable Angular zoneless
      // behavior, true in every Angular app, not something this swap changes. What DOES
      // still protect a sibling branch from an unrelated press is a genuine child
      // `@Component` boundary — SignalView-compiled children are skip-eligible regardless of
      // this scheduler.
      ...provideZonelessChangeDetectionInternal(),
      // Angular's own INTERNAL_APPLICATION_ERROR_HANDLER (core.mjs) reports a tick()
      // exception by calling `injector.get(ErrorHandler)` — a normal `bootstrapApplication`
      // registers this token by default (platform-browser's BROWSER_MODULE_PROVIDERS), but
      // our from-scratch environment injector never did, so that lookup itself threw
      // NG0201 and REPLACED whatever the real error was with an unrelated "No provider
      // found for ErrorHandler" — the real exception never got logged, and the NG0201 itself
      // propagated out of a bare Timeout callback uncaught (nothing above it in the stack to
      // catch it), i.e. any async tick() exception, anywhere in the app, crashed hard instead
      // of being reported. Providing the default `ErrorHandler` (same one bootstrapApplication
      // ships) restores the intended behavior: `console.error('ERROR', e)` and keep running.
      { provide: ErrorHandler, useClass: ErrorHandler },
      ColorSchemeService,
      WindowDimensionsService,
    ],
    rootInjectorParent(),
  );

  // hostElement = the surface: the component's template content commits straight into the
  // surface with no wrapper view, the engine wrapping surface.children in its synthetic flex
  // root — the Angular equivalent of Vue's `app.mount(surface)`.
  let cmpRef: ComponentRef<unknown>;
  let rootRef: ComponentRef<unknown> | undefined;
  if (options?.wrapperComponent === undefined) {
    cmpRef = createComponent<unknown>(rootComponent, {
      environmentInjector: injector,
      hostElement: asAngularHost(surface),
    });
    applyInputs(cmpRef, options?.initialProps);
  } else {
    // The root gets its own host node from the renderer (createComponent without a
    // hostElement) but is not attached to the surface directly; it is handed to the
    // wrapper as projectable content instead, so only the wrapper needs a real host.
    const rootHost = asAngularHost(createDetachedViewHost());
    rootRef = createComponent<unknown>(rootComponent, {
      environmentInjector: injector,
      hostElement: rootHost,
    });
    applyInputs(rootRef, options.initialProps);
    cmpRef = createComponent<unknown>(options.wrapperComponent, {
      environmentInjector: injector,
      hostElement: asAngularHost(surface),
      projectableNodes: [[rootHost]],
    });
  }

  // Attach both root views to ApplicationRef so its own tick() (via the real
  // ChangeDetectionSchedulerImpl provided above) drives them from here on — no manual
  // ChangeDetectorRef juggling needed. markForCheck anywhere in the tree now notifies
  // the real scheduler, which batches a microtask and calls appRef.tick() itself.
  const appRef = injector.get(ApplicationRef);
  appRef.attachView(cmpRef.hostView);
  if (rootRef !== undefined) {
    appRef.attachView(rootRef.hostView);
  }

  dlog(`angular mount root=${rootTag}`);
  appRef.tick(); // first paint
  surface.requestCommit();

  apps.set(rootTag, { cmpRef, rootRef, injector });
  return surface;
}

// Tear down a surface by rootTag: the public pair of `mount`, and the JS half of the
// bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal).
export function unmount(rootTag: IRootTag): void {
  dlog(`angular unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is the JSI hook C++ AppRegistryBinding::stopSurface calls to stop a
// Fabric surface. RN installs it from its own renderer; symbiote REPLACES that renderer, so
// without this the binding throws "Global was not installed" on every surface stop (Fast
// Refresh, focus/lifecycle) and the screen goes blank. Same contract as the React/Vue
// adapters: an app uses one adapter, so exactly one installer runs.
declare global {
  var RN$stopSurface: ((surfaceId: number) => void) | undefined;
}

function installStopSurfaceGlobal(): void {
  globalThis.RN$stopSurface = (surfaceId: number): void => {
    unmount(surfaceId);
  };
  dlog('installed global.RN$stopSurface');
}

installStopSurfaceGlobal();
