// VirtualizedSectionList — sections flattened into one virtualized stream. Each
// section contributes a header row, its item rows, then a footer row (RN's
// VirtualizedSectionList counts 2 per section — header AND footer — around the
// items); the flattened sequence is fed to VirtualizedList as a single list of
// tagged entries, so headers, items, and footers are all windowed by the same
// machinery. renderSectionHeader paints headers, renderItem paints items,
// renderSectionFooter paints footers. This is the lower layer in RN's
// SectionList -> VirtualizedSectionList -> VirtualizedList stack; SectionList is
// a thin wrapper over it.

import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { dlog } from '@symbiote/shared'
import { VirtualizedList } from './virtualized-list'
import type { ViewStyle } from './styles'

export interface Section<ItemT> {
  title: string
  data: readonly ItemT[]
}

// A flattened entry is a section header, an item, or a section footer, tagged so
// the single renderItem can dispatch to renderSectionHeader / renderItem /
// renderSectionFooter.
type Entry<ItemT> =
  | { kind: 'header'; section: Section<ItemT>; sectionIndex: number }
  | { kind: 'item'; item: ItemT; section: Section<ItemT>; sectionIndex: number; itemIndex: number }
  | { kind: 'footer'; section: Section<ItemT>; sectionIndex: number }

export interface VirtualizedSectionListProps<ItemT> {
  sections: ReadonlyArray<Section<ItemT>>
  renderItem: (info: { item: ItemT; index: number; section: Section<ItemT> }) => ReactNode
  renderSectionHeader?: (info: { section: Section<ItemT> }) => ReactNode
  renderSectionFooter?: (info: { section: Section<ItemT> }) => ReactNode
  keyExtractor?: (item: ItemT, index: number) => string
  ItemSeparatorComponent?: ComponentType<Record<string, never>>
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  initialNumToRender?: number
  windowSize?: number
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}

function flattenSections<ItemT>(sections: ReadonlyArray<Section<ItemT>>): Entry<ItemT>[] {
  const entries: Entry<ItemT>[] = []
  sections.forEach((section, sectionIndex) => {
    entries.push({ kind: 'header', section, sectionIndex })
    section.data.forEach((item, itemIndex) => {
      entries.push({ kind: 'item', item, section, sectionIndex, itemIndex })
    })
    entries.push({ kind: 'footer', section, sectionIndex })
  })
  return entries
}

export function VirtualizedSectionList<ItemT>(
  props: VirtualizedSectionListProps<ItemT>,
): ReactElement {
  const {
    sections,
    renderItem,
    renderSectionHeader,
    renderSectionFooter,
    keyExtractor,
    ...rest
  } = props

  const entries = flattenSections(sections)

  dlog(`VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`)

  const renderEntry = (info: { item: Entry<ItemT>; index: number }): ReactNode => {
    const entry = info.item
    if (entry.kind === 'header') {
      return renderSectionHeader ? renderSectionHeader({ section: entry.section }) : undefined
    }
    if (entry.kind === 'footer') {
      return renderSectionFooter ? renderSectionFooter({ section: entry.section }) : undefined
    }
    return renderItem({ item: entry.item, index: entry.itemIndex, section: entry.section })
  }

  const entryKeyExtractor = (entry: Entry<ItemT>, index: number): string => {
    if (entry.kind === 'header') return `section-${entry.sectionIndex}`
    if (entry.kind === 'footer') return `section-${entry.sectionIndex}:footer`
    if (keyExtractor) return keyExtractor(entry.item, entry.itemIndex)
    return `entry-${index}`
  }

  return createElement(VirtualizedList<Entry<ItemT>>, {
    data: entries,
    getItem: (_source: unknown, index: number): Entry<ItemT> => entries[index],
    getItemCount: (): number => entries.length,
    renderItem: renderEntry,
    keyExtractor: entryKeyExtractor,
    ...rest,
  })
}
