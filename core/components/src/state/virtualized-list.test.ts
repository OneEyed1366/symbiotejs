import { describe, it, expect } from 'vitest';
import {
  computeMvcpAdjustment,
  resolveItemKey,
  indexOfItem,
  offsetForEnd,
  isSeparatorGapInRange,
  decideEdgeReached,
  resolveStickySectionHeaders,
  wrapFixedLayout,
  resolveAverageLength,
  type ICellLayout,
} from './virtualized-list';

// keyFor over a fixed key array (index -> key), the adapter's keyForIndex twin.
const keyForOf =
  (keys: string[]) =>
  (index: number): string =>
    keys[index] ?? String(index);
// uniform 100px cells: offsets[i] = i*100.
const uniformOffsets = (n: number): number[] => Array.from({ length: n }, (_value, i) => i * 100);

describe('computeMvcpAdjustment', () => {
  it('no-ops with MVCP off (minIndexForVisible undefined)', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: undefined,
      autoscrollToTopThreshold: undefined,
      count: 5,
      committedFirst: 0,
      offsets: uniformOffsets(5),
      scrollOffset: 0,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['a', 'b', 'c', 'd', 'e']),
    });
    expect(result).toEqual({ firstVisibleKey: null, action: { kind: 'none' } });
  });

  it('no-ops on an empty list', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 0,
      committedFirst: 0,
      offsets: [],
      scrollOffset: 0,
      prevFirstVisibleKey: null,
      keyFor: keyForOf([]),
    });
    expect(result).toEqual({ firstVisibleKey: null, action: { kind: 'none' } });
  });

  it('first pass records the anchor key without acting', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 3,
      committedFirst: 0,
      offsets: uniformOffsets(3),
      scrollOffset: 0,
      prevFirstVisibleKey: null,
      keyFor: keyForOf(['a', 'b', 'c']),
    });
    expect(result).toEqual({ firstVisibleKey: 'a', action: { kind: 'none' } });
  });

  it('no-ops when the anchor key is unchanged', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 3,
      committedFirst: 0,
      offsets: uniformOffsets(3),
      scrollOffset: 50,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['a', 'b', 'c']),
    });
    expect(result).toEqual({ firstVisibleKey: 'a', action: { kind: 'none' } });
  });

  it('shifts by the inserted spacer extent on a prepend below a scrolled window', () => {
    // 'a' was at index 0; a 2-item prepend pushed it to index 2, window scrolled (committedFirst=2).
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 5,
      committedFirst: 2,
      offsets: uniformOffsets(5),
      scrollOffset: 500,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['x', 'y', 'a', 'b', 'c']),
    });
    // spacerEnd = min(2,2)=2; insertedExtent = offsets[2]-offsets[0] = 200; shift = 500+200.
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'shift', offset: 700 } });
  });

  it('autoscrolls to top when the anchor sits within the threshold', () => {
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: 10,
      count: 5,
      committedFirst: 2,
      offsets: uniformOffsets(5),
      scrollOffset: 5,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['x', 'y', 'a', 'b', 'c']),
    });
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'autoscroll-top' } });
  });

  it('no-ops when the prepend stays inside the committed window (native MVCP owns it)', () => {
    // committedFirst=0: the whole prepend is in-window; JS must not double-correct.
    const result = computeMvcpAdjustment({
      minIndexForVisible: 0,
      autoscrollToTopThreshold: undefined,
      count: 5,
      committedFirst: 0,
      offsets: uniformOffsets(5),
      scrollOffset: 0,
      prevFirstVisibleKey: 'a',
      keyFor: keyForOf(['x', 'y', 'a', 'b', 'c']),
    });
    // spacerEnd = min(2,0)=0; insertedExtent 0 → none.
    expect(result).toEqual({ firstVisibleKey: 'x', action: { kind: 'none' } });
  });
});

describe('resolveItemKey', () => {
  it('uses the keyExtractor when provided', () => {
    expect(resolveItemKey({ id: 'a' }, 3, item => item.id)).toBe('a');
  });
  it('falls back to the stringified index', () => {
    expect(resolveItemKey({ id: 'a' }, 3, undefined)).toBe('3');
  });
});

describe('indexOfItem', () => {
  const items = ['a', 'b', 'c'];
  const getItem = (_data: unknown, index: number): unknown => items[index];
  it('finds the index by reference identity', () => {
    expect(indexOfItem(items, getItem, 3, 'b')).toBe(1);
  });
  it('returns NO_INDEX (-1) when the item is absent', () => {
    expect(indexOfItem(items, getItem, 3, 'z')).toBe(-1);
  });
});

describe('offsetForEnd', () => {
  it('scrolls the content to the bottom edge', () => {
    expect(offsetForEnd(1000, 300)).toBe(700);
  });
  it('never goes negative when content is shorter than the viewport', () => {
    expect(offsetForEnd(200, 300)).toBe(0);
  });
});

describe('isSeparatorGapInRange', () => {
  it('accepts gaps inside [0, count-2]', () => {
    expect(isSeparatorGapInRange(0, 3)).toBe(true);
    expect(isSeparatorGapInRange(1, 3)).toBe(true);
  });
  it('rejects gaps below 0 or past the last gap', () => {
    expect(isSeparatorGapInRange(-1, 3)).toBe(false);
    expect(isSeparatorGapInRange(2, 3)).toBe(false);
  });
});

describe('decideEdgeReached', () => {
  it('fires once when within threshold, edge rendered, and not yet sent for this length', () => {
    expect(
      decideEdgeReached({
        withinThreshold: true,
        edgeCellRendered: true,
        total: 500,
        sentForContentLength: -1,
      }),
    ).toEqual({ shouldFire: true, nextSentForContentLength: 500 });
  });
  it('does not re-fire for the same content length (dedup)', () => {
    expect(
      decideEdgeReached({
        withinThreshold: true,
        edgeCellRendered: true,
        total: 500,
        sentForContentLength: 500,
      }),
    ).toEqual({ shouldFire: false, nextSentForContentLength: 500 });
  });
  it('does not fire when the edge cell is not rendered, leaving the sentinel untouched', () => {
    expect(
      decideEdgeReached({
        withinThreshold: true,
        edgeCellRendered: false,
        total: 500,
        sentForContentLength: -1,
      }),
    ).toEqual({ shouldFire: false, nextSentForContentLength: -1 });
  });
  it('re-arms when scrolled out of threshold', () => {
    expect(
      decideEdgeReached({
        withinThreshold: false,
        edgeCellRendered: false,
        total: 500,
        sentForContentLength: 500,
      }),
    ).toEqual({ shouldFire: false, nextSentForContentLength: -1 });
  });
});

describe('resolveStickySectionHeaders', () => {
  it('sticks by default on iOS', () => {
    expect(resolveStickySectionHeaders(undefined, [0, 4], 'ios')).toEqual([0, 4]);
  });
  it('does not stick by default off iOS', () => {
    expect(resolveStickySectionHeaders(undefined, [0, 4], 'android')).toBeUndefined();
  });
  it('honors the explicit prop over the platform default', () => {
    expect(resolveStickySectionHeaders(false, [0, 4], 'ios')).toBeUndefined();
    expect(resolveStickySectionHeaders(true, [0, 4], 'android')).toEqual([0, 4]);
  });
});

describe('wrapFixedLayout', () => {
  it('returns undefined without getItemLayout', () => {
    expect(wrapFixedLayout([], undefined)).toBeUndefined();
  });
  it('wraps getItemLayout into an (index) => ICellLayout, dropping the index field', () => {
    const getItemLayout = (_data: unknown, index: number) => ({
      length: 10,
      offset: index * 10,
      index,
    });
    const fixed = wrapFixedLayout(['a', 'b'], getItemLayout);
    expect(fixed?.(1)).toEqual({ length: 10, offset: 10 });
  });
});

describe('resolveAverageLength', () => {
  const measured = new Map([
    [0, 20],
    [1, 40],
  ]);
  it('averages the measured cells when there is no fixed layout', () => {
    expect(resolveAverageLength(undefined, 2, measured)).toBe(30);
  });
  it('uses the first fixed cell length when getItemLayout is set', () => {
    const fixed = (): ICellLayout => ({ length: 50, offset: 0 });
    expect(resolveAverageLength(fixed, 3, measured)).toBe(50);
  });
  it('guards an empty list (count 0) instead of touching a missing cell', () => {
    const fixed = (): ICellLayout => {
      throw new Error('must not touch a cell on an empty list');
    };
    expect(resolveAverageLength(fixed, 0, measured)).toBe(0);
  });
});
