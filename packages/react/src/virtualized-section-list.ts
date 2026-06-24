// VirtualizedSectionList — sections flattened into one virtualized stream. Each
// section contributes a header row, its item rows, then a footer row (RN's
// VirtualizedSectionList counts 2 per section — header AND footer — around the
// items); the flattened sequence is fed to VirtualizedList as a single list of
// tagged entries, so headers, items, and footers are all windowed by the same
// machinery. renderSectionHeader paints headers, renderItem paints items,
// renderSectionFooter paints footers, SectionSeparatorComponent paints the gap
// between adjacent sections. This is the lower layer in RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList stack; SectionList is
// a thin wrapper over it.

import {
  createElement,
  useImperativeHandle,
  useRef,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { dlog } from '@symbiote/shared'
import { VirtualizedList, type VirtualizedListHandle } from './virtualized-list'
import type { ScrollViewHandle } from './scroll-view'
import type { AccessibilityProps, AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

export interface Section<ItemT> {
  title: string
  data: readonly ItemT[]
}

// A flattened entry is a section header, an item, a section footer, or a
// between-sections separator, tagged so the single renderItem can dispatch to
// the right renderer. The separator carries no data — it just paints the gap.
type Entry<ItemT> =
  | { kind: 'header'; section: Section<ItemT>; sectionIndex: number }
  | { kind: 'item'; item: ItemT; section: Section<ItemT>; sectionIndex: number; itemIndex: number }
  | { kind: 'footer'; section: Section<ItemT>; sectionIndex: number }
  | { kind: 'section-separator'; sectionIndex: number }

// The imperative API RN exposes on a SectionList ref. scrollToLocation resolves a
// (sectionIndex, itemIndex) coordinate to the flattened entry index and forwards
// to the inner VirtualizedList's scrollToIndex.
export interface VirtualizedSectionListHandle {
  scrollToLocation(params: {
    sectionIndex: number
    itemIndex: number
    viewOffset?: number
    viewPosition?: number
    animated?: boolean
  }): void
  // The same flash/scroll-ref/interaction surface as VirtualizedListHandle, routed
  // to the inner VirtualizedList (RN's SectionList forwards these to it too).
  flashScrollIndicators(): void
  getNativeScrollRef(): ScrollViewHandle | null
  getScrollableNode(): ScrollViewHandle | null
  getScrollResponder(): ScrollViewHandle | null
  recordInteraction(): void
}

export interface VirtualizedSectionListProps<ItemT> extends AccessibilityProps, AriaProps {
  sections: ReadonlyArray<Section<ItemT>>
  renderItem: (info: { item: ItemT; index: number; section: Section<ItemT> }) => ReactNode
  renderSectionHeader?: (info: { section: Section<ItemT> }) => ReactNode
  renderSectionFooter?: (info: { section: Section<ItemT> }) => ReactNode
  // Painted between adjacent sections (after one section's footer, before the
  // next section's header). Mirrors RN's SectionSeparatorComponent.
  SectionSeparatorComponent?: ComponentType<Record<string, never>> | ReactElement
  keyExtractor?: (item: ItemT, index: number) => string
  // Stick each section header to the top as the next section scrolls up. Routed to
  // the inner VirtualizedList's stickyHeaderIndices (the section-header flat indices),
  // which forwards the in-window ones to the ScrollView's native stickyHeaderIndices.
  // Defaults to RN's true; pass false to scroll headers away with their section.
  stickySectionHeadersEnabled?: boolean
  extraData?: unknown
  ItemSeparatorComponent?: ComponentType<Record<string, never>>
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  // Top-edge twin of onEndReached, forwarded through to the inner VirtualizedList.
  onStartReached?: (info: { distanceFromStart: number }) => void
  onStartReachedThreshold?: number
  // Pull-to-refresh, forwarded through to the inner VirtualizedList.
  onRefresh?: () => void
  refreshing?: boolean | null
  progressViewOffset?: number
  initialNumToRender?: number
  initialScrollIndex?: number
  maxToRenderPerBatch?: number
  updateCellsBatchingPeriod?: number
  windowSize?: number
  inverted?: boolean
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}

// Flatten sections into entries AND record where each section header lands in the
// flat stream, so scrollToLocation can map (sectionIndex, itemIndex) -> flat
// index without re-deriving the layout. withSeparators inserts a section
// separator between adjacent sections (never before the first / after the last).
function flattenSections<ItemT>(
  sections: ReadonlyArray<Section<ItemT>>,
  withSeparators: boolean,
): { entries: Entry<ItemT>[]; headerIndices: number[] } {
  const entries: Entry<ItemT>[] = []
  const headerIndices: number[] = []
  sections.forEach((section, sectionIndex) => {
    if (withSeparators && sectionIndex > 0) {
      entries.push({ kind: 'section-separator', sectionIndex })
    }
    headerIndices[sectionIndex] = entries.length
    entries.push({ kind: 'header', section, sectionIndex })
    section.data.forEach((item, itemIndex) => {
      entries.push({ kind: 'item', item, section, sectionIndex, itemIndex })
    })
    entries.push({ kind: 'footer', section, sectionIndex })
  })
  return { entries, headerIndices }
}

function resolveSeparator(
  component: ComponentType<Record<string, never>> | ReactElement | undefined,
): ReactNode {
  if (component === undefined) return undefined
  if (typeof component === 'function') return createElement(component, {})
  return component
}

export function VirtualizedSectionList<ItemT>(
  props: VirtualizedSectionListProps<ItemT> & { ref?: Ref<VirtualizedSectionListHandle> },
): ReactElement {
  const {
    ref,
    sections,
    renderItem,
    renderSectionHeader,
    renderSectionFooter,
    SectionSeparatorComponent,
    keyExtractor,
    stickySectionHeadersEnabled,
    ...rest
  } = props

  const { entries, headerIndices } = flattenSections(
    sections,
    SectionSeparatorComponent !== undefined,
  )

  // RN sticks section headers unless explicitly disabled. headerIndices are the flat
  // positions of every section header; VirtualizedList forwards the in-window ones to
  // the ScrollView's native stickyHeaderIndices.
  const stickyHeaderIndices = stickySectionHeadersEnabled === false ? undefined : headerIndices

  // The handle reaches into the inner VirtualizedList to drive scrollToIndex.
  const listRef = useRef<VirtualizedListHandle | null>(null)

  dlog(`VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`)

  useImperativeHandle(
    ref ?? null,
    () => ({
      scrollToLocation: (params: {
        sectionIndex: number
        itemIndex: number
        viewOffset?: number
        viewPosition?: number
        animated?: boolean
      }): void => {
        const headerFlatIndex = headerIndices[params.sectionIndex]
        if (headerFlatIndex === undefined) {
          dlog(`VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`)
          return
        }
        // RN's itemIndex is offset by 1 so itemIndex 0 targets the header, and
        // itemIndex >= 1 targets that section's items. We mirror that mapping.
        const flatIndex = headerFlatIndex + params.itemIndex
        dlog(
          `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
            `item=${params.itemIndex} -> flat ${flatIndex}`,
        )
        listRef.current?.scrollToIndex({
          index: flatIndex,
          viewOffset: params.viewOffset,
          viewPosition: params.viewPosition,
          animated: params.animated,
        })
      },
      // Forward the inner VirtualizedList's flash/scroll-ref/interaction surface.
      flashScrollIndicators: (): void => {
        listRef.current?.flashScrollIndicators()
      },
      getNativeScrollRef: (): ScrollViewHandle | null =>
        listRef.current?.getNativeScrollRef() ?? null,
      getScrollableNode: (): ScrollViewHandle | null =>
        listRef.current?.getScrollableNode() ?? null,
      getScrollResponder: (): ScrollViewHandle | null =>
        listRef.current?.getScrollResponder() ?? null,
      recordInteraction: (): void => {
        listRef.current?.recordInteraction()
      },
    }),
    [headerIndices],
  )

  const renderEntry = (info: { item: Entry<ItemT>; index: number }): ReactNode => {
    const entry = info.item
    if (entry.kind === 'header') {
      return renderSectionHeader ? renderSectionHeader({ section: entry.section }) : undefined
    }
    if (entry.kind === 'footer') {
      return renderSectionFooter ? renderSectionFooter({ section: entry.section }) : undefined
    }
    if (entry.kind === 'section-separator') {
      return resolveSeparator(SectionSeparatorComponent)
    }
    return renderItem({ item: entry.item, index: entry.itemIndex, section: entry.section })
  }

  const entryKeyExtractor = (entry: Entry<ItemT>, index: number): string => {
    if (entry.kind === 'header') return `section-${entry.sectionIndex}`
    if (entry.kind === 'footer') return `section-${entry.sectionIndex}:footer`
    if (entry.kind === 'section-separator') return `section-${entry.sectionIndex}:separator`
    if (keyExtractor) return keyExtractor(entry.item, entry.itemIndex)
    return `entry-${index}`
  }

  return createElement(VirtualizedList<Entry<ItemT>>, {
    ref: listRef,
    data: entries,
    getItem: (_source: unknown, index: number): Entry<ItemT> => entries[index],
    getItemCount: (): number => entries.length,
    renderItem: renderEntry,
    keyExtractor: entryKeyExtractor,
    stickyHeaderIndices,
    ...rest,
  })
}
