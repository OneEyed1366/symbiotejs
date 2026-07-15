// Compile-time + shape proof for the extraction in scroll-routing-handle.ts: both list
// handle types must stay composed of the SAME shared routing tail plus only their own
// primary member(s), so a stub satisfying one composes cleanly into the other. The real
// drift guard is structural (TypeScript itself, via these literal assignments and
// expectTypeOf) - `pnpm --filter @symbiote-native/components run typecheck` excludes
// *.test.ts, so removing a member here needs a separate check: run the Vue adapter's
// typecheck, whose literal `handle: IVirtualizedListHandle = {...}` and
// `isVirtualizedListHandle` guards give real excess/missing-property errors.

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { IScrollViewHandle } from '../../scroll-view-commands';
import type { IScrollRoutingHandle } from './index';
import type { IVirtualizedListHandle } from '../virtualized-list';
import type { IVirtualizedSectionListHandle } from '../section-list';

function createRoutingStub(calls: string[]): IScrollRoutingHandle {
  const fakeScrollHandle: IScrollViewHandle = {
    scrollTo: () => calls.push('scrollTo'),
    scrollToEnd: () => calls.push('scrollToEnd'),
    flashScrollIndicators: () => calls.push('inner-flash'),
    getScrollNode: () => null,
  };
  return {
    flashScrollIndicators: () => calls.push('flashScrollIndicators'),
    getNativeScrollRef: () => fakeScrollHandle,
    getScrollableNode: () => fakeScrollHandle,
    getScrollResponder: () => fakeScrollHandle,
    getScrollNode: () => null,
    recordInteraction: () => calls.push('recordInteraction'),
  };
}

describe('IScrollRoutingHandle composition', () => {
  it('IVirtualizedListHandle is satisfied by the shared routing tail plus its own scrollTo* primaries', () => {
    const calls: string[] = [];
    const routing = createRoutingStub(calls);
    const handle: IVirtualizedListHandle = {
      ...routing,
      scrollToOffset: ({ offset }) => calls.push(`scrollToOffset:${offset}`),
      scrollToIndex: ({ index }) => calls.push(`scrollToIndex:${index}`),
      scrollToItem: () => calls.push('scrollToItem'),
      scrollToEnd: () => calls.push('scrollToEnd'),
    };

    handle.scrollToOffset({ offset: 10 });
    handle.recordInteraction();
    handle.flashScrollIndicators();
    expect(handle.getNativeScrollRef()).toBe(handle.getScrollableNode());
    expect(calls).toEqual(['scrollToOffset:10', 'recordInteraction', 'flashScrollIndicators']);
  });

  it('IVirtualizedSectionListHandle is satisfied by the shared routing tail plus scrollToLocation', () => {
    const calls: string[] = [];
    const routing = createRoutingStub(calls);
    const handle: IVirtualizedSectionListHandle = {
      ...routing,
      scrollToLocation: ({ sectionIndex, itemIndex }) =>
        calls.push(`scrollToLocation:${sectionIndex}:${itemIndex}`),
    };

    handle.scrollToLocation({ sectionIndex: 1, itemIndex: 2 });
    handle.getScrollNode();
    handle.recordInteraction();
    expect(calls).toEqual(['scrollToLocation:1:2', 'recordInteraction']);
  });

  it('both handle types extend the identical IScrollRoutingHandle base (type-level)', () => {
    expectTypeOf<IVirtualizedListHandle>().toExtend<IScrollRoutingHandle>();
    expectTypeOf<IVirtualizedSectionListHandle>().toExtend<IScrollRoutingHandle>();
  });
});
