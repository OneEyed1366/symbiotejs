// SectionList — the public, high-level list-of-sections component. It is a thin
// wrapper over VirtualizedSectionList, mirroring RN's layering
// (SectionList -> VirtualizedSectionList -> VirtualizedList). All the
// section-flattening / windowing / imperative-scroll logic lives in
// VirtualizedSectionList; this layer only re-exposes the same surface under the
// SectionList name so existing consumers and the canary keep importing it from
// here, threading the imperative ref straight through.

import { createElement, type ReactElement, type Ref } from 'react'
import {
  VirtualizedSectionList,
  type VirtualizedSectionListHandle,
  type VirtualizedSectionListProps,
} from './virtualized-section-list'

export type { Section } from './virtualized-section-list'

// SectionList's public surface is exactly VirtualizedSectionList's. Keep the name
// distinct so the high-level contract has its own identity even though the shape
// matches the lower layer one-for-one today.
export type SectionListProps<ItemT> = VirtualizedSectionListProps<ItemT>
export type SectionListHandle = VirtualizedSectionListHandle

export function SectionList<ItemT>(
  props: SectionListProps<ItemT> & { ref?: Ref<SectionListHandle> },
): ReactElement {
  return createElement(VirtualizedSectionList<ItemT>, props)
}
