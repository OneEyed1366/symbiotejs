// createTunnel for @symbiote-native/angular — the Angular twin of the React/Vue cross-surface tunnel
// (adapters/react/src/create-tunnel.tsx, adapters/vue/src/create-tunnel.ts — read their
// headers for the full "why not just extend the portal across surfaces" rationale; same prior
// art: pmndrs/tunnel-rat, facebook/react#17147). `TunnelOut` lives in whichever component should
// PAINT the content; its OWN read of the shared store drives that surface's own normal render
// cycle — no cross-surface reach-in, no rootTag lookup, works whether TunnelIn and TunnelOut
// share a surface or not.
//
// Angular cannot mirror React's/Vue's shape verbatim: both of those build a FRESH `In`/`Out`
// pair per `createTunnel()` call (a closure-scoped class in Vue, closure-scoped functions in
// React). Angular components can't be synthesized at runtime — there is no JIT compiler under
// Metro/Hermes (see modules/animated/create-animated-component.ts's header for the same
// constraint). So here `createTunnel()` returns only a plain reactive STORE (a signal);
// `TunnelInDirective` and `TunnelOut` are ONE static, pre-authored, AOT-compilable pair,
// parameterized by that store through an input — same relationship `VListOutletDirective` has
// to the per-cell template it stamps, generalized to an open-ended, changing SET of templates.
//
// TunnelInDirective is a STRUCTURAL directive (`*tunnelIn="overlayTunnel"`), not a component
// that takes a separate `<ng-template>` + `[content]` binding — matching `*portal` (see
// create-portal.ts's header for why that reads as native Angular and the two-step form
// doesn't). `TunnelOut` stays a plain component (`<tunnel-out>`) — it's a rendering SLOT, the
// same shape as Angular's own `<router-outlet>`, not content that needs a structural directive.
//
// App code stays fully declarative — no ViewContainerRef/imperative rendering — by putting
// `*tunnelIn` directly on the portable content, the same way `*ngIf` sits directly on an
// element instead of wrapping it in a named `<ng-template>`:
//   @if (toastVisible) {
//     <View *tunnelIn="overlayTunnel"><Text>…</Text></View>
//   }
//   …
//   <tunnel-out [tunnel]="overlayTunnel" />
// No `context` param: unlike a `*ngFor` cell template, tunneled content needs no per-registration
// data — it already closes over whatever signals/fields its OWN declaring component exposes, and
// Angular's own change detection keeps that live once the embedded view exists, the same way any
// other template does.

import {
  Component,
  Directive,
  effect,
  inject,
  Injector,
  Input,
  signal,
  TemplateRef,
  ViewContainerRef,
  type EmbeddedViewRef,
  type OnDestroy,
  type OnInit,
  type Signal,
} from '@angular/core';

export interface ITunnelStore {
  readonly entries: Signal<ReadonlyMap<number, TemplateRef<unknown>>>;
  register(id: number, templateRef: TemplateRef<unknown>): void;
  unregister(id: number): void;
}

export function createTunnel(): ITunnelStore {
  const store = signal<ReadonlyMap<number, TemplateRef<unknown>>>(new Map());

  return {
    entries: store.asReadonly(),
    register(id, templateRef) {
      store.update(map => new Map(map).set(id, templateRef));
    },
    unregister(id) {
      store.update(map => {
        if (!map.has(id)) return map;
        const next = new Map(map);
        next.delete(id);
        return next;
      });
    },
  };
}

let nextTunnelEntryId = 0;

/** `*tunnelIn="overlayTunnel"` — registers the host element under `overlayTunnel` from
 *  wherever it's mounted, any surface. Combine with `@if` for conditional visibility, exactly
 *  like `*ngIf`. */
@Directive({ selector: '[tunnelIn]', standalone: true })
export class TunnelInDirective implements OnInit, OnDestroy {
  @Input({ required: true }) tunnelIn!: ITunnelStore;

  private readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly id = nextTunnelEntryId++;

  ngOnInit(): void {
    this.tunnelIn.register(this.id, this.templateRef);
  }

  ngOnDestroy(): void {
    this.tunnelIn.unregister(this.id);
  }
}

/** Renders everything currently registered on `tunnel`, in registration order. Mount this in
 *  the component that should actually paint the content — the tunnel's own `<router-outlet>`. */
@Component({
  selector: 'tunnel-out',
  standalone: true,
  template: '',
})
export class TunnelOut implements OnInit, OnDestroy {
  @Input({ required: true }) tunnel!: ITunnelStore;

  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly views = new Map<number, EmbeddedViewRef<unknown>>();
  private stopEffect: (() => void) | undefined;

  ngOnInit(): void {
    const ref = effect(() => this.sync(this.tunnel.entries()), { injector: this.injector });
    this.stopEffect = () => ref.destroy();
  }

  ngOnDestroy(): void {
    this.stopEffect?.();
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
  }

  private sync(entries: ReadonlyMap<number, TemplateRef<unknown>>): void {
    for (const [id, view] of this.views) {
      if (entries.has(id)) continue;
      view.destroy();
      this.views.delete(id);
    }
    for (const [id, templateRef] of entries) {
      if (this.views.has(id)) continue;
      this.views.set(id, this.viewContainerRef.createEmbeddedView(templateRef));
    }
  }
}
