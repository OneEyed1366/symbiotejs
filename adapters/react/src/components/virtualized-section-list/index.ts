// VirtualizedSectionList: sections flattened into one virtualized stream. Each section
// contributes a header row, its item rows, then a footer row; the flattened sequence is fed to
// VirtualizedList as a single tagged list, so headers, items, and footers are all windowed by the
// same machinery. The flattening, entry keying, separator-item unwrap, and scrollToLocation
// mapping are shared from @symbiote-native/components; this file wires React's lifecycle (refs +
// useImperativeHandle + the per-entry render dispatch). Lower layer in RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList stack.

import {
  createElement,
  useImperativeHandle,
  useRef,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { dlog, Platform, type ISymbioteEvent, type ISymbioteNode } from '@symbiote-native/engine';
import {
  flattenSections,
  resolveStickySectionHeaders,
  scrollLocationToFlatIndex,
  sectionEntryKey,
  unwrapEntryItem,
  type ISection,
  type ISectionEntry,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  VirtualizedList,
  type ISeparators,
  type ISeparatorProps,
  type IVirtualizedListHandle,
} from '../virtualized-list';
import type { IScrollViewHandle } from '../scroll-view';
import type { IAccessibilityProps, IAriaProps } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

export type { ISection } from '@symbiote-native/components';
// Re-export the shared handle type so section-list imports it from '../virtualized-section-list'.
export type { IVirtualizedSectionListHandle };

export interface IVirtualizedSectionListProps<ItemT> extends IAccessibilityProps, IAriaProps {
  sections: ReadonlyArray<ISection<ItemT>>;
  renderItem: (info: {
    item: ItemT;
    index: number;
    section: ISection<ItemT>;
    separators: ISeparators;
  }) => ReactNode;
  renderSectionHeader?: (info: { section: ISection<ItemT> }) => ReactNode;
  renderSectionFooter?: (info: { section: ISection<ItemT> }) => ReactNode;
  // Painted between adjacent sections (after one section's footer, before the next section's
  // header). Mirrors RN's SectionSeparatorComponent.
  SectionSeparatorComponent?: ComponentType<Record<string, never>> | ReactElement;
  keyExtractor?: (item: ItemT, index: number) => string;
  // Stick each section header to the top as the next section scrolls up. Routed to the inner
  // VirtualizedList's stickyHeaderIndices. Defaults to `Platform.OS === 'ios'` (RN
  // SectionList.js:243-244); Android does not stick by default. Pass true/false to override.
  stickySectionHeadersEnabled?: boolean;
  extraData?: unknown;
  ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement;
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement;
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  inverted?: boolean;
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  onScroll?: (event: ISymbioteEvent) => void;
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  // Forwarded onto the inner list like `style` — resolves through the shared style registry.
  className?: string;
}

function resolveSeparator(
  component: ComponentType<Record<string, never>> | ReactElement | undefined,
): ReactNode {
  if (component === undefined) return undefined;
  if (typeof component === 'function') return createElement(component, {});
  return component;
}

export function VirtualizedSectionList<ItemT>(
  props: IVirtualizedSectionListProps<ItemT> & { ref?: Ref<IVirtualizedSectionListHandle> },
): ReactElement {
  const {
    ref,
    sections,
    renderItem,
    renderSectionHeader,
    renderSectionFooter,
    SectionSeparatorComponent,
    // Pulled out of `rest`: the user's separator is typed on ItemT, but the inner VirtualizedList
    // streams ISectionEntry<ItemT>, so we wrap it to unwrap each entry back to its ItemT.
    ItemSeparatorComponent,
    keyExtractor,
    stickySectionHeadersEnabled,
    ...rest
  } = props;

  const { entries, headerIndices } = flattenSections(
    sections,
    SectionSeparatorComponent !== undefined,
  );

  // RN sticks section headers by default only on iOS; Android does not unless asked. headerIndices
  // are the flat positions of every section header; VirtualizedList forwards the in-window ones.
  const stickyHeaderIndices = resolveStickySectionHeaders(
    stickySectionHeadersEnabled,
    headerIndices,
    Platform.OS,
  );

  // The handle reaches into the inner VirtualizedList to drive scrollToIndex.
  const listRef = useRef<IVirtualizedListHandle | null>(null);

  dlog(
    `VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`,
  );

  useImperativeHandle(
    ref ?? null,
    () => ({
      scrollToLocation: (params: {
        sectionIndex: number;
        itemIndex: number;
        viewOffset?: number;
        viewPosition?: number;
        animated?: boolean;
      }): void => {
        const flatIndex = scrollLocationToFlatIndex(
          headerIndices,
          params.sectionIndex,
          params.itemIndex,
        );
        if (flatIndex === undefined) {
          dlog(
            `VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
          );
          return;
        }
        dlog(
          `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
            `item=${params.itemIndex} -> flat ${flatIndex}`,
        );
        listRef.current?.scrollToIndex({
          index: flatIndex,
          viewOffset: params.viewOffset,
          viewPosition: params.viewPosition,
          animated: params.animated,
        });
      },
      flashScrollIndicators: (): void => {
        listRef.current?.flashScrollIndicators();
      },
      getNativeScrollRef: (): IScrollViewHandle | null =>
        listRef.current?.getNativeScrollRef() ?? null,
      getScrollableNode: (): IScrollViewHandle | null =>
        listRef.current?.getScrollableNode() ?? null,
      getScrollResponder: (): IScrollViewHandle | null =>
        listRef.current?.getScrollResponder() ?? null,
      getScrollNode: (): ISymbioteNode | null => listRef.current?.getScrollNode() ?? null,
      recordInteraction: (): void => {
        listRef.current?.recordInteraction();
      },
    }),
    [headerIndices],
  );

  const renderEntry = (info: {
    item: ISectionEntry<ItemT>;
    index: number;
    separators: ISeparators;
  }): ReactNode => {
    const entry = info.item;
    if (entry.kind === 'header') {
      return renderSectionHeader ? renderSectionHeader({ section: entry.section }) : undefined;
    }
    if (entry.kind === 'footer') {
      return renderSectionFooter ? renderSectionFooter({ section: entry.section }) : undefined;
    }
    if (entry.kind === 'section-separator') {
      return resolveSeparator(SectionSeparatorComponent);
    }
    return renderItem({
      item: entry.item,
      index: entry.itemIndex,
      section: entry.section,
      separators: info.separators,
    });
  };

  // The user's ItemSeparatorComponent is typed on ItemT; the inner stream is the entry wrapper, so
  // unwrap each entry back to its ItemT (shared unwrapEntryItem) before handing it to the user.
  const entrySeparatorComponent: ComponentType<ISeparatorProps<ISectionEntry<ItemT>>> | undefined =
    ItemSeparatorComponent === undefined
      ? undefined
      : (entryProps): ReactNode =>
          createElement(ItemSeparatorComponent, {
            ...entryProps,
            leadingItem: unwrapEntryItem(entryProps.leadingItem),
            trailingItem: unwrapEntryItem(entryProps.trailingItem),
          });

  const entryKeyExtractor = (entry: ISectionEntry<ItemT>, index: number): string =>
    sectionEntryKey(entry, index, keyExtractor);

  return createElement(VirtualizedList<ISectionEntry<ItemT>>, {
    ref: listRef,
    data: entries,
    getItem: (_source: unknown, index: number): ISectionEntry<ItemT> => entries[index],
    getItemCount: (): number => entries.length,
    renderItem: renderEntry,
    keyExtractor: entryKeyExtractor,
    stickyHeaderIndices,
    ItemSeparatorComponent: entrySeparatorComponent,
    ...rest,
  });
}
