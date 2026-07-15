// createPortal for @symbiote-native/angular — the Angular twin of the React/Vue same-surface portal
// (create-portal.ts / Teleport in runtime-helpers.ts). Scope is identical: the target must be
// an already-mounted location WITHIN THE SAME SURFACE as the portal's call site — moving content
// across independently-mounted surfaces has no safe host-level primitive to hook into, so
// createTunnel (create-tunnel.ts) covers that cross-surface case instead.
//
// React/Vue implement this as a thin validating wrapper around a mechanism the FRAMEWORK
// ITSELF already has (react-reconciler's Fiber-level HostPortal, Vue's own <Teleport>) — all
// the actual node-moving is handled generically by the engine's insert/remove, which those
// frameworks already call. Angular has no such built-in: there is no `@angular/cdk` dependency
// here (core-only, see package.json), and physically moving an EmbeddedView's already-created
// root nodes via Renderer2 after the fact is NOT safe — Angular's own view-destroy path removes
// a view's nodes from wherever ITS OWN bookkeeping thinks they live (the container's insertion
// point), not from wherever a node was manually moved to afterwards, so a raw Renderer2 move
// would desync Angular's internals from the retained tree.
//
// PortalDirective is a STRUCTURAL directive (`*portal="overlayHost"`), not a component that
// takes a separate `<ng-template>` + `[content]` binding — that two-step reads as foreign to
// anyone used to `*ngIf`/`*ngFor`/`*ngTemplateOutlet`, where the directive sits directly on the
// content and its TemplateRef comes from injection, not a passed-in reference. `*portal="x"`
// desugars the same way `*ngIf` does: Angular wraps the host element in an `<ng-template>` and
// injects that template's own TemplateRef into the directive automatically.
//
// The safe, fully-public-API mechanism: create the embedded view DIRECTLY inside a
// ViewContainerRef anchored at the destination, so there is nothing to move at all. That
// ViewContainerRef has to come from somewhere in the destination's own template — hence
// `PortalOutletDirective`, a marker placed on the target host (`<View portalOutlet
// #overlayHost="portalOutlet">`) purely to expose its ViewContainerRef, the same
// export-as-template-variable idiom `#form="ngForm"` uses. This also replaces the
// `isSymbioteNode` runtime guard React/Vue need: there `to` is an arbitrary JS value at
// runtime (a wrong ref, a string, a plain object all type-check as `any`/`unknown` until
// validated), but here `to` is typed as `PortalOutletDirective` — the only way to construct
// one is Angular's own template compiler resolving a template reference variable, so
// `strictTemplates` rejects anything else at compile time and there is nothing left to guard
// against at runtime.

import {
  Directive,
  inject,
  Input,
  TemplateRef,
  ViewContainerRef,
  type EmbeddedViewRef,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';

/** Marks the destination for `*portal` — place it on whichever already-mounted host should
 *  paint the portaled content (e.g. a persistent overlay-host View near the app root), then
 *  export it to a template variable and pass that variable as `*portal`'s target. */
@Directive({ selector: '[portalOutlet]', standalone: true, exportAs: 'portalOutlet' })
export class PortalOutletDirective {
  readonly viewContainerRef = inject(ViewContainerRef);
}

/** `*portal="overlayHost"` — renders the host element into whichever `PortalOutletDirective`
 *  `overlayHost` refers to, same surface only (see the file header). Combine with `@if` for
 *  conditional visibility, exactly like `*ngIf`. */
@Directive({ selector: '[portal]', standalone: true })
export class PortalDirective implements OnChanges, OnDestroy {
  @Input({ required: true }) portal!: PortalOutletDirective;

  private readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
  private viewRef: EmbeddedViewRef<unknown> | null = null;

  ngOnChanges(): void {
    this.viewRef?.destroy();
    this.viewRef = this.portal.viewContainerRef.createEmbeddedView(this.templateRef);
  }

  ngOnDestroy(): void {
    this.viewRef?.destroy();
  }
}
