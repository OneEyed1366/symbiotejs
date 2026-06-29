// VirtualizedSectionList, the Vue wrapper that flattens sections into one virtualized stream
// over VirtualizedList. Each section contributes a header row, its item rows, then a footer row
// (RN counts 2 per section); the flattened tagged sequence is fed to VirtualizedList as one list,
// so headers/items/footers are all windowed by the same machinery. The flattening, entry keying,
// separator-item unwrap, and scrollToLocation mapping are shared from @symbiote/components; this
// file wires Vue lifecycle (attrs narrowing + handle re-expose + the per-entry render dispatch).
// The Vue twin of the React adapter's VirtualizedSectionList.

import {
  defineComponent,
  h,
  isVNode,
  shallowRef,
  type Component,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  flattenSections,
  scrollLocationToFlatIndex,
  sectionEntryKey,
  unwrapEntryItem,
  type ISection,
  type ISectionEntry,
  type ISeparatorProps,
  type ISeparators,
  type IScrollViewHandle,
  type IVirtualizedListHandle,
  type IVirtualizedSectionListHandle,
} from '@symbiote/components';
import { Platform, dlog, type ISymbioteNode } from '@symbiote/engine';
import { VirtualizedList } from '../virtualized-list';
import { normalizeVueAttrs } from '../normalize-attrs';

export type { ISection } from '@symbiote/components';
// Re-export the shared handle type so section-list imports it from '../virtualized-section-list'.
export type { IVirtualizedSectionListHandle };

type IUnknownHandler = (...args: readonly unknown[]) => unknown;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isComponent(value: unknown): value is Component {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}
function isVirtualizedListHandle(value: unknown): value is IVirtualizedListHandle {
  return isRecord(value) && typeof value.scrollToOffset === 'function';
}
function asSections(value: unknown): ISection<unknown>[] {
  if (!Array.isArray(value)) return [];
  const sections: ISection<unknown>[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const data = Array.isArray(entry.data) ? entry.data : [];
    const title = typeof entry.title === 'string' ? entry.title : '';
    sections.push({ title, data });
  }
  return sections;
}

// A list component (SectionSeparatorComponent) is either a Vue component or a ready VNode.
function resolveSeparator(value: unknown): VNode | undefined {
  if (value === undefined || value === null) return undefined;
  if (isVNode(value)) return value;
  if (isComponent(value)) return h(value);
  return undefined;
}

const HANDLED_ATTRS = [
  'sections',
  'renderItem',
  'renderSectionHeader',
  'renderSectionFooter',
  'SectionSeparatorComponent',
  'ItemSeparatorComponent',
  'keyExtractor',
  'stickySectionHeadersEnabled',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

function buildSectionDelegate(
  getInner: () => IVirtualizedListHandle | null,
  getHeaderIndices: () => number[],
): IVirtualizedSectionListHandle {
  return {
    scrollToLocation: (params): void => {
      const flatIndex = scrollLocationToFlatIndex(
        getHeaderIndices(),
        params.sectionIndex,
        params.itemIndex,
      );
      if (flatIndex === undefined) {
        dlog(
          `Vue VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
        );
        return;
      }
      dlog(
        `Vue VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
          `item=${params.itemIndex} -> flat ${flatIndex}`,
      );
      getInner()?.scrollToIndex({
        index: flatIndex,
        viewOffset: params.viewOffset,
        viewPosition: params.viewPosition,
        animated: params.animated,
      });
    },
    flashScrollIndicators: () => getInner()?.flashScrollIndicators(),
    getNativeScrollRef: (): IScrollViewHandle | null => getInner()?.getNativeScrollRef() ?? null,
    getScrollableNode: (): IScrollViewHandle | null => getInner()?.getScrollableNode() ?? null,
    getScrollResponder: (): IScrollViewHandle | null => getInner()?.getScrollResponder() ?? null,
    getScrollNode: (): ISymbioteNode | null => getInner()?.getScrollNode() ?? null,
    recordInteraction: () => getInner()?.recordInteraction(),
  };
}

export const VirtualizedSectionList = defineComponent({
  name: 'VirtualizedSectionList',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, expose }: SetupContext) {
    const inner = shallowRef<IVirtualizedListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isVirtualizedListHandle(instance) ? instance : null;
    };
    // headerIndices change each render (sections may change); the delegate reads them lazily.
    let headerIndices: number[] = [];
    expose(
      buildSectionDelegate(
        () => inner.value,
        () => headerIndices,
      ),
    );

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const sections = asSections(attrs.sections);
      const renderItemRaw = attrs.renderItem;
      const renderSectionHeaderRaw = attrs.renderSectionHeader;
      const renderSectionFooterRaw = attrs.renderSectionFooter;
      const sectionSeparator = attrs.SectionSeparatorComponent;
      const itemSeparatorComponent = isComponent(attrs.ItemSeparatorComponent)
        ? attrs.ItemSeparatorComponent
        : undefined;
      const keyExtractorRaw = attrs.keyExtractor;
      const keyExtractor = isHandler(keyExtractorRaw)
        ? (item: unknown, index: number): string => {
            const key = keyExtractorRaw(item, index);
            return typeof key === 'string' ? key : String(index);
          }
        : undefined;

      const { entries, headerIndices: indices } = flattenSections(
        sections,
        sectionSeparator !== undefined,
      );
      headerIndices = indices;

      // RN sticks section headers by default only on iOS; Android does not unless asked.
      const stickyDefault = Platform.OS === 'ios';
      const stickyEnabled =
        typeof attrs.stickySectionHeadersEnabled === 'boolean'
          ? attrs.stickySectionHeadersEnabled
          : stickyDefault;
      const stickyHeaderIndices = stickyEnabled ? indices : undefined;

      dlog(
        `Vue VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`,
      );

      const renderEntry = (info: {
        item: ISectionEntry<unknown>;
        index: number;
        separators: ISeparators;
      }): VNode | undefined => {
        const entry = info.item;
        if (entry.kind === 'header') {
          if (!isHandler(renderSectionHeaderRaw)) return undefined;
          const node = renderSectionHeaderRaw({ section: entry.section });
          return isVNode(node) ? node : undefined;
        }
        if (entry.kind === 'footer') {
          if (!isHandler(renderSectionFooterRaw)) return undefined;
          const node = renderSectionFooterRaw({ section: entry.section });
          return isVNode(node) ? node : undefined;
        }
        if (entry.kind === 'section-separator') {
          return resolveSeparator(sectionSeparator);
        }
        if (!isHandler(renderItemRaw)) return undefined;
        const node = renderItemRaw({
          item: entry.item,
          index: entry.itemIndex,
          section: entry.section,
          separators: info.separators,
        });
        return isVNode(node) ? node : undefined;
      };

      // The user's ItemSeparatorComponent is typed on ItemT, but the inner stream is the entry
      // wrapper; unwrap each entry back to its ItemT (shared unwrapEntryItem) before handing it on.
      const entrySeparatorComponent: Component | undefined =
        itemSeparatorComponent === undefined
          ? undefined
          : (entryProps: ISeparatorProps<ISectionEntry<unknown>>): VNode =>
              h(itemSeparatorComponent, {
                ...entryProps,
                leadingItem: unwrapEntryItem(entryProps.leadingItem),
                trailingItem: unwrapEntryItem(entryProps.trailingItem),
              });

      const entryKeyExtractor = (entry: ISectionEntry<unknown>, index: number): string =>
        sectionEntryKey(entry, index, keyExtractor);

      return h(VirtualizedList, {
        ...forwardAttrs(attrs),
        ref: setInner,
        data: entries,
        getItem: (_source: unknown, index: number): ISectionEntry<unknown> => entries[index],
        getItemCount: (): number => entries.length,
        renderItem: renderEntry,
        keyExtractor: entryKeyExtractor,
        stickyHeaderIndices,
        ItemSeparatorComponent: entrySeparatorComponent,
      });
    };
  },
});
