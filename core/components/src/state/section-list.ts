// SectionList logic: the framework-agnostic section flattening over VirtualizedList. Each
// section contributes a header row, its item rows, then a footer row (RN counts 2 per
// section around the items); the flattened sequence feeds VirtualizedList as one tagged
// stream, so headers, items, and footers are windowed by the same machinery. All of this
// is pure transform — every adapter reuses it; the adapter supplies only the per-entry
// element creation (renderSectionHeader / renderItem / …) and the ref wiring.

import type { ISymbioteNode } from '@symbiote/engine';
import type { IScrollViewHandle } from '../scroll-view-commands';

export interface ISection<ItemT> {
  title: string;
  data: readonly ItemT[];
}

// A flattened entry is a section header, an item, a section footer, or a between-sections
// separator, tagged so the single renderItem can dispatch to the right renderer. The
// separator carries no data — it just paints the gap.
export type ISectionEntry<ItemT> =
  | { kind: 'header'; section: ISection<ItemT>; sectionIndex: number }
  | {
      kind: 'item';
      item: ItemT;
      section: ISection<ItemT>;
      sectionIndex: number;
      itemIndex: number;
    }
  | { kind: 'footer'; section: ISection<ItemT>; sectionIndex: number }
  | { kind: 'section-separator'; sectionIndex: number };

// The imperative API RN exposes on a SectionList ref. scrollToLocation resolves a
// (sectionIndex, itemIndex) coordinate to the flattened entry index and forwards to the
// inner VirtualizedList's scrollToIndex. The flash/scroll-ref/interaction surface routes
// to the inner VirtualizedList. Shared by both adapters so the surface CANNOT drift.
export interface IVirtualizedSectionListHandle {
  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void;
  flashScrollIndicators(): void;
  getNativeScrollRef(): IScrollViewHandle | null;
  getScrollableNode(): IScrollViewHandle | null;
  getScrollResponder(): IScrollViewHandle | null;
  getScrollNode(): ISymbioteNode | null;
  recordInteraction(): void;
}

// Flatten sections into entries AND record where each section header lands in the flat
// stream, so scrollToLocation can map (sectionIndex, itemIndex) -> flat index without
// re-deriving the layout. withSeparators inserts a section separator between adjacent
// sections (never before the first / after the last).
export function flattenSections<ItemT>(
  sections: ReadonlyArray<ISection<ItemT>>,
  withSeparators: boolean,
): { entries: ISectionEntry<ItemT>[]; headerIndices: number[] } {
  const entries: ISectionEntry<ItemT>[] = [];
  const headerIndices: number[] = [];
  sections.forEach((section, sectionIndex) => {
    if (withSeparators && sectionIndex > 0) {
      entries.push({ kind: 'section-separator', sectionIndex });
    }
    headerIndices[sectionIndex] = entries.length;
    entries.push({ kind: 'header', section, sectionIndex });
    section.data.forEach((item, itemIndex) => {
      entries.push({ kind: 'item', item, section, sectionIndex, itemIndex });
    });
    entries.push({ kind: 'footer', section, sectionIndex });
  });
  return { entries, headerIndices };
}

// Unwrap an entry separator-prop into its underlying ItemT (or undefined for a non-item
// entry: header/footer/section-separator gaps have no item), so the user's
// ItemSeparatorComponent, typed on ItemT, sees real items.
export function unwrapEntryItem<ItemT>(entry: ISectionEntry<ItemT> | undefined): ItemT | undefined {
  return entry !== undefined && entry.kind === 'item' ? entry.item : undefined;
}

export function sectionEntryKey<ItemT>(
  entry: ISectionEntry<ItemT>,
  index: number,
  keyExtractor?: (item: ItemT, index: number) => string,
): string {
  if (entry.kind === 'header') return `section-${entry.sectionIndex}`;
  if (entry.kind === 'footer') return `section-${entry.sectionIndex}:footer`;
  if (entry.kind === 'section-separator') return `section-${entry.sectionIndex}:separator`;
  if (keyExtractor) return keyExtractor(entry.item, entry.itemIndex);
  return `entry-${index}`;
}

// RN's itemIndex is offset by 1 so itemIndex 0 targets the header and itemIndex >= 1
// targets that section's items. Returns undefined when the section is out of range.
export function scrollLocationToFlatIndex(
  headerIndices: number[],
  sectionIndex: number,
  itemIndex: number,
): number | undefined {
  const headerFlatIndex = headerIndices[sectionIndex];
  if (headerFlatIndex === undefined) return undefined;
  return headerFlatIndex + itemIndex;
}
