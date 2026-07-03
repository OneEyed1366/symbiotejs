// VirtualizedSectionList authoring directives: the Angular-faithful equivalent of React/Vue's
// `renderItem` / `renderSectionHeader` / `renderSectionFooter` / `SectionSeparatorComponent`.
// React/Vue pass element-returning callbacks; that does NOT translate to Angular, where per-cell
// content is a TEMPLATE. So the app supplies each section slot as an `<ng-template>` carrying one
// of these structural directives, and VirtualizedSectionList stamps the windowed slice through
// them. This is the per-adapter children/render split of <prop_types_split_agnostic_vs_per_adapter>:
// the shared flatten/window surface stays in @symbiotejs/components, only the cell-AUTHORING shape is
// framework-specific. SectionList (the next layer) reuses these same directives verbatim.
//
// Authoring API (what the app imports and what SectionList builds on):
//   <VirtualizedSectionList [sections]="sections">
//     <ng-template vSectionItem let-item let-index="index" let-section="section" let-separators="separators"> … </ng-template>
//     <ng-template vSectionHeader let-section> … </ng-template>
//     <ng-template vSectionFooter let-section> … </ng-template>
//     <ng-template vSectionSeparator> … </ng-template>            <!-- between adjacent sections -->
//     <!-- list-level slots reuse VirtualizedList's own directives: -->
//     <ng-template vListHeader> … </ng-template>
//     <ng-template vListFooter> … </ng-template>
//     <ng-template vListEmpty> … </ng-template>
//     <ng-template vListSeparator let-highlighted let-leadingItem="leadingItem"> … </ng-template>  <!-- between items -->
//   </VirtualizedSectionList>
//
// Each directive carries a static ngTemplateContextGuard so the `let-` bindings infer at the call
// site (the Angular twin of renderItem / renderSectionHeader's typed info arg).

import { Directive, TemplateRef, inject } from '@angular/core';
import type { ISection, ISeparators } from '@symbiotejs/components';

// The context a `vSectionItem` template receives, mirroring RN's section renderItem info arg
// ({ item, index, section, separators }). `$implicit` is the item, so `let-item` (no key) binds it.
export interface IVSectionItemContext<ItemT> {
  $implicit: ItemT;
  item: ItemT;
  index: number;
  section: ISection<ItemT>;
  separators: ISeparators;
}

// The context a `vSectionHeader` / `vSectionFooter` template receives (RN's renderSectionHeader /
// renderSectionFooter info arg, { section }). `$implicit` is the section, so `let-section` (no key)
// binds it.
export interface IVSectionContext<ItemT> {
  $implicit: ISection<ItemT>;
  section: ISection<ItemT>;
}

// `<ng-template vSectionItem>` — one section item row. The static guard types the `let-` bindings.
@Directive({ selector: '[vSectionItem]', standalone: true })
export class VSectionItemDirective<ItemT = unknown> {
  readonly templateRef = inject<TemplateRef<IVSectionItemContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionItemDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionItemContext<T> {
    return true;
  }
}

// `<ng-template vSectionHeader>` — rendered above each section's items (RN renderSectionHeader).
@Directive({ selector: '[vSectionHeader]', standalone: true })
export class VSectionHeaderDirective<ItemT = unknown> {
  readonly templateRef = inject<TemplateRef<IVSectionContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionHeaderDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionContext<T> {
    return true;
  }
}

// `<ng-template vSectionFooter>` — rendered below each section's items (RN renderSectionFooter).
@Directive({ selector: '[vSectionFooter]', standalone: true })
export class VSectionFooterDirective<ItemT = unknown> {
  readonly templateRef = inject<TemplateRef<IVSectionContext<ItemT>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: VSectionFooterDirective<T>,
    _ctx: unknown,
  ): _ctx is IVSectionContext<T> {
    return true;
  }
}

// `<ng-template vSectionSeparator>` — painted between adjacent sections (after one section's footer,
// before the next section's header). Mirrors RN's SectionSeparatorComponent; carries no context.
@Directive({ selector: '[vSectionSeparator]', standalone: true })
export class VSectionSeparatorDirective {
  readonly templateRef = inject(TemplateRef);
}
