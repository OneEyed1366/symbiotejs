// SectionList, the Vue public list-of-sections component. A thin wrapper over
// VirtualizedSectionList, mirroring RN's layering (SectionList -> VirtualizedSectionList ->
// VirtualizedList). All section-flattening / windowing / imperative-scroll logic lives below;
// this layer re-exposes the same surface under the SectionList name and re-exposes the handle
// (Vue resolves a parent ref to the exposed object, so the wrapper delegates). The Vue twin of
// the React adapter's SectionList.
//
// Typed-emits generic component (mirrors FlatList / VirtualizedList): a GENERIC setup function
// `<ItemT,>(props: ISectionListProps<ItemT>, ctx: ICtx<ISectionListEmits>)` so the section inputs
// (sections/renderItem/…) infer ItemT at the call site. As a pure forwarder it consumes nothing
// itself — every input rides through $attrs straight onto VirtualizedSectionList; only the three
// synthesized events (endReached/startReached/refresh) are bridged, gated on listener presence so
// the inner list keeps its RefreshControl / edge-reached gating.

import {
  defineComponent,
  getCurrentInstance,
  h,
  shallowRef,
  type FunctionalComponent,
} from '@vue/runtime-core';
import type { ISymbioteNode } from '@symbiotejs/engine';
import type { IScrollViewHandle, IVirtualizedSectionListHandle } from '@symbiotejs/components';
import {
  VirtualizedSectionList,
  type IVirtualizedSectionListEmits,
  type IVirtualizedSectionListProps,
  type IVirtualizedSectionListSlots,
} from '../virtualized-section-list';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import type { ICtx } from '../../utils/component-helpers';

// VirtualizedSectionList is a generic component (generic construct signature), which h()'s overloads
// can't resolve. Drive it through a loose functional-component handle (generic-component h() limit).
const VirtualizedSectionListHost = VirtualizedSectionList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

export type { ISection } from '../virtualized-section-list';
export type ISectionListHandle = IVirtualizedSectionListHandle;

// SectionList's public surface is exactly VirtualizedSectionList's (RN layers them one-for-one) —
// props, the synthesized emits, and the scoped-slot surface alike.
export type ISectionListProps<ItemT> = IVirtualizedSectionListProps<ItemT>;
export type ISectionListEmits = IVirtualizedSectionListEmits;
export type ISectionListSlots<ItemT> = IVirtualizedSectionListSlots<ItemT>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSectionHandle(value: unknown): value is IVirtualizedSectionListHandle {
  return isRecord(value) && typeof value.scrollToLocation === 'function';
}

const EMIT_KEYS = ['endReached', 'startReached', 'refresh'];

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

export const SectionList = defineComponent(
  // _props is read only by the type system: ISectionListProps<ItemT> is what lets ItemT infer at
  // the call site. As a pure forwarder, SectionList consumes nothing at runtime — it spreads $attrs.
  <ItemT>(
    _props: ISectionListProps<ItemT>,
    { attrs, expose, emit, slots }: ICtx<ISectionListEmits, ISectionListSlots<ItemT>>,
  ) => {
    const inner = shallowRef<IVirtualizedSectionListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isSectionHandle(instance) ? instance : null;
    };
    expose(buildDelegate(() => inner.value));

    // The three section-list events are emits, so Vue strips their onX listeners from $attrs. Detect
    // listener presence off the instance's own vnode props and bridge each ONLY when listened, so
    // the inner VirtualizedSectionList (and its inner VirtualizedList) keeps its on-demand gating.
    const instance = getCurrentInstance();
    const listens = (onName: string): boolean => {
      const vnodeProps = instance?.vnode.props;
      return vnodeProps != null && typeof vnodeProps[onName] === 'function';
    };

    return () => {
      const endReached = listens('onEndReached')
        ? (info: { distanceFromEnd: number }): void => emit('endReached', info)
        : undefined;
      const startReached = listens('onStartReached')
        ? (info: { distanceFromStart: number }): void => emit('startReached', info)
        : undefined;
      const refresh = listens('onRefresh') ? (): void => emit('refresh') : undefined;

      // Pure forwarder: spread $attrs as props and pass the consumer's scoped slots (#item /
      // #sectionHeader / … ) straight down to VirtualizedSectionList untouched.
      return h(
        VirtualizedSectionListHost,
        {
          ...normalizeVueAttrs(attrs),
          ref: setInner,
          onEndReached: endReached,
          onStartReached: startReached,
          onRefresh: refresh,
        },
        slots,
      );
    };
  },
  {
    name: 'SectionList',
    inheritAttrs: false,
    emits: EMIT_KEYS,
  } as unknown as undefined,
);
