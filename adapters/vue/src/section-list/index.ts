// SectionList, the Vue public list-of-sections component. A thin wrapper over
// VirtualizedSectionList, mirroring RN's layering (SectionList -> VirtualizedSectionList ->
// VirtualizedList). All section-flattening / windowing / imperative-scroll logic lives below;
// this layer re-exposes the same surface under the SectionList name and re-exposes the handle
// (Vue resolves a parent ref to the exposed object, so the wrapper delegates). The Vue twin of
// the React adapter's SectionList.

import { defineComponent, h, shallowRef, type SetupContext } from '@vue/runtime-core';
import type { ISymbioteNode } from '@symbiote/engine';
import type { IScrollViewHandle, IVirtualizedSectionListHandle } from '@symbiote/components';
import { VirtualizedSectionList } from '../virtualized-section-list';
import { normalizeVueAttrs } from '../normalize-attrs';

export type { ISection } from '../virtualized-section-list';
export type ISectionListHandle = IVirtualizedSectionListHandle;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSectionHandle(value: unknown): value is IVirtualizedSectionListHandle {
  return isRecord(value) && typeof value.scrollToLocation === 'function';
}

function buildDelegate(
  getInner: () => IVirtualizedSectionListHandle | null,
): IVirtualizedSectionListHandle {
  return {
    scrollToLocation: params => getInner()?.scrollToLocation(params),
    flashScrollIndicators: () => getInner()?.flashScrollIndicators(),
    getNativeScrollRef: (): IScrollViewHandle | null => getInner()?.getNativeScrollRef() ?? null,
    getScrollableNode: (): IScrollViewHandle | null => getInner()?.getScrollableNode() ?? null,
    getScrollResponder: (): IScrollViewHandle | null => getInner()?.getScrollResponder() ?? null,
    getScrollNode: (): ISymbioteNode | null => getInner()?.getScrollNode() ?? null,
    recordInteraction: () => getInner()?.recordInteraction(),
  };
}

export const SectionList = defineComponent({
  name: 'SectionList',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, expose }: SetupContext) {
    const inner = shallowRef<IVirtualizedSectionListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isSectionHandle(instance) ? instance : null;
    };
    expose(buildDelegate(() => inner.value));

    return () => h(VirtualizedSectionList, { ...normalizeVueAttrs(rawAttrs), ref: setInner });
  },
});
