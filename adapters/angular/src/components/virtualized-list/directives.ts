// VirtualizedList authoring directives: the Angular-faithful equivalent of React/Vue
// `renderItem` / `ListHeaderComponent` / `ListFooterComponent` / `ListEmptyComponent` /
// `ItemSeparatorComponent`. React/Vue pass an element-returning callback; that does NOT
// translate to Angular, where per-item content is a TEMPLATE. So the app supplies each
// slot as an `<ng-template>` carrying one of these structural directives, and the list
// stamps the windowed slice through them. This is the per-adapter children/render split of
// <prop_types_split_agnostic_vs_per_adapter>: the agnostic windowing surface stays shared,
// only the cell-AUTHORING shape is framework-specific.
//
// Authoring API (what FlatList / SectionList build on, and what the app imports):
//   <VirtualizedList [data]="rows" [getItem]="getItem" [getItemCount]="count">
//     <ng-template vListItem let-item let-index="index" let-separators="separators"> … </ng-template>
//     <ng-template vListHeader> … </ng-template>
//     <ng-template vListFooter> … </ng-template>
//     <ng-template vListEmpty> … </ng-template>
//     <ng-template vListSeparator let-highlighted="highlighted" let-leadingItem="leadingItem"> … </ng-template>
//   </VirtualizedList>
//
// `vListItem` carries a static ngTemplateContextGuard so `let-item` infers as ItemT and
// `let-index` / `let-separators` are typed — the Angular twin of `renderItem`'s typed info arg.
//
// VListOutletDirective is the INTERNAL renderer the list uses to stamp those templates. It is
// a core-only reimplementation of `@angular/common`'s NgTemplateOutlet (the adapter depends on
// @angular/core ONLY — see package.json), built on ViewContainerRef / TemplateRef from
// @angular/core: create on template change, update the embedded view's context in place on a
// context change (no churn of the cell's own view across windowing recomputes).

import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
  type EmbeddedViewRef,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
} from '@angular/core';
import { dlog } from '@symbiotejs/engine';
import type { ISeparators } from '@symbiotejs/components';

let vListOutletInstanceCounter = 0;

// The context a `vListItem` template receives, mirroring RN's renderItem info arg
// ({ item, index, separators }). `$implicit` is the item, so `let-item` (no key) binds it.
export interface IVListItemContext<ItemT> {
  $implicit: ItemT;
  index: number;
  separators: ISeparators;
}

// The context a `vListSeparator` template receives, mirroring RN's ItemSeparatorComponent props
// (the highlight flag the cell toggles + the items flanking the gap). `$implicit` is the highlight
// flag, so `let-highlighted` binds it.
export interface IVListSeparatorContext<ItemT> {
  $implicit: boolean;
  highlighted: boolean;
  leadingItem?: ItemT;
  trailingItem?: ItemT;
  // RN lets a row drive arbitrary separator props via separators.updateProps; they ride here.
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// `<ng-template vListItem>` — the per-cell content. The static guard makes the `let-` bindings
// typed at the call site (let-item: ItemT, let-index: number, let-separators: ISeparators).
@Directive({ selector: '[vListItem]', standalone: true })
export class VListItemDirective<ItemT = unknown> {
  readonly templateRef = inject<TemplateRef<IVListItemContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VListItemDirective<T>,
    _ctx: unknown,
  ): _ctx is IVListItemContext<T> {
    return true;
  }
}

// `<ng-template vListHeader>` — rendered once above the cells (RN ListHeaderComponent).
@Directive({ selector: '[vListHeader]', standalone: true })
export class VListHeaderDirective {
  readonly templateRef = inject(TemplateRef);
}

// `<ng-template vListFooter>` — rendered once below the cells (RN ListFooterComponent).
@Directive({ selector: '[vListFooter]', standalone: true })
export class VListFooterDirective {
  readonly templateRef = inject(TemplateRef);
}

// `<ng-template vListEmpty>` — rendered in place of the cells when the list is empty
// (RN ListEmptyComponent).
@Directive({ selector: '[vListEmpty]', standalone: true })
export class VListEmptyDirective {
  readonly templateRef = inject(TemplateRef);
}

// `<ng-template vListSeparator>` — rendered between cells (RN ItemSeparatorComponent). The guard
// types the `let-` bindings against the separator props.
@Directive({ selector: '[vListSeparator]', standalone: true })
export class VListSeparatorDirective<ItemT = unknown> {
  readonly templateRef = inject<TemplateRef<IVListSeparatorContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VListSeparatorDirective<T>,
    _ctx: unknown,
  ): _ctx is IVListSeparatorContext<T> {
    return true;
  }
}

// Core-only NgTemplateOutlet twin. The adapter cannot import @angular/common's NgTemplateOutlet
// (not a dependency), so the list stamps templates through this: it creates the embedded view when
// the template changes and updates the live view's context IN PLACE on a context change, so a
// windowing recompute (a fresh context object every CD) refreshes the cell without tearing it down.
@Directive({ selector: '[vListOutlet]', standalone: true })
export class VListOutletDirective<C = unknown> implements OnChanges, OnDestroy {
  @Input({ alias: 'vListOutlet' }) templateRef?: TemplateRef<C>;
  @Input({ alias: 'vListOutletContext' }) context?: C;

  private viewRef: EmbeddedViewRef<C> | null = null;
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly instanceId = (vListOutletInstanceCounter += 1);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['templateRef'] !== undefined) {
      dlog(
        `Angular VListOutlet#${this.instanceId} templateRef CHANGED (was=${changes['templateRef'].previousValue !== undefined} now=${this.templateRef !== undefined}) -> clear + recreate`,
      );
      this.viewContainer.clear();
      this.viewRef =
        this.templateRef === undefined
          ? null
          : this.viewContainer.createEmbeddedView(this.templateRef, this.context);
      return;
    }
    if (this.viewRef !== null && this.context !== undefined) {
      dlog(`Angular VListOutlet#${this.instanceId} context updated, markForCheck`);
      this.updateContext(this.viewRef.context, this.context);
      this.viewRef.markForCheck();
    }
  }

  ngOnDestroy(): void {
    dlog(`Angular VListOutlet#${this.instanceId} destroyed`);
    this.viewContainer.clear();
  }

  // Copy the new context's fields onto the live embedded view's context object (whose identity the
  // consumer's `let-` bindings already read), dropping keys that disappeared. The generic `C` can't
  // be index-WRITTEN even once narrowed (TS2862), so the copy runs in a non-generic helper the
  // guarded records flow into — no cast (NgTemplateOutlet does the same copy via `as any`).
  private updateContext(viewContext: C, nextContext: C): void {
    if (!isRecord(viewContext) || !isRecord(nextContext)) return;
    copyContextFields(viewContext, nextContext);
  }
}

function copyContextFields(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const key of Object.keys(source)) {
    target[key] = source[key];
  }
}
