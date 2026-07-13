// Sticky headers: the framework-agnostic math behind the JS layer RN implements in
// ScrollView.js / ScrollViewStickyHeader.js. RN does stickiness PURELY IN JS: a single
// scroll AnimatedValue drives each flagged header's translateY through an interpolation that
// keeps it pinned to the top (or bottom, inverted) until the next header collides with it.
// The native Fabric scroll view does NOT honor stickyHeaderIndices on its own. The load-bearing
// piece, the top/inverted inputRange/outputRange math (computeStickyInterpolation), is ported
// byte-for-byte from ScrollViewStickyHeader.js's effect. The adapter owns the component shell,
// the layout state, and building the interpolation onto its Animated value.

import type { AnimatedValue, ISymbioteEvent } from '@symbiote-native/engine';
import { readLayoutField } from './layout-event';

// RN gives the sticky wrapper zIndex:10 (ScrollViewStickyHeader.js styles.header) so the
// pinned header paints OVER the rows that scroll up under it. Without it the next rows (later
// siblings) paint on top and bleed through the header.
export const STICKY_HEADER_Z_INDEX = 10;

// RN debounces the Fabric ShadowTree transform sync (ScrollViewStickyHeader.js): the smooth pin
// rides the native driver, but the committed transform must catch up for hit-testing. Android
// needs the tighter window because its tap hit-detection moves to JS on finger-move.
const STICKY_DEBOUNCE_ANDROID_MS = 15;
const STICKY_DEBOUNCE_IOS_MS = 64;

// The debounce window for pushing the settled translateY into the committed transform, by host.
export function stickyDebounceMs(os: string): number {
  return os === 'android' ? STICKY_DEBOUNCE_ANDROID_MS : STICKY_DEBOUNCE_IOS_MS;
}

// The framework-agnostic props a sticky header wrapper is fed (ScrollViewStickyHeader.js). The
// adapter's component adds its own `children` slot on top of these; a custom StickyHeaderComponent
// must accept the same shape.
export type IStickyHeaderProps = {
  // y of the NEXT sticky header in content space, the collision point past which this header
  // stops translating and scrolls off to make room. undefined when there is no next header.
  nextHeaderLayoutY: number | undefined;
  onLayout: (event: ISymbioteEvent) => void;
  scrollAnimatedValue: AnimatedValue;
  // Stick to the bottom instead of the top.
  inverted: boolean | undefined;
  // Parent scroll view height, only needed (and only set) when inverted.
  scrollViewHeight: number | undefined;
};

// Thin re-export kept for the existing public surface (adapters import this name from
// `@symbiote-native/components`); the actual field read is shared with render-scroll-view's
// width/height read in layout-event.ts.
export function readLayoutNumber(event: ISymbioteEvent, key: 'y' | 'height'): number | undefined {
  return readLayoutField(event, key);
}

// The inputs the top/inverted interpolation math reads. `measured` gates the extra ranges:
// before the header has measured its own y/height, the interpolation is the identity stub.
export type IStickyInterpolationParams = {
  measured: boolean;
  inverted: boolean | undefined;
  scrollViewHeight: number | undefined;
  layoutY: number;
  layoutHeight: number;
  nextHeaderLayoutY: number | undefined;
};

// Build the scroll-offset -> translateY interpolation ranges that keep the header pinned.
// Ported byte-for-byte from ScrollViewStickyHeader.js's effect (both branches). The base
// [-1, 0] -> [0, 0] stub is the un-measured identity; once measured, the top branch pins at
// layoutY and tracks 1:1 until the next header pushes it off, while the inverted branch pins
// at the viewport bottom (stickStartPoint) and tracks up to the collision point.
export function computeStickyInterpolation(params: IStickyInterpolationParams): {
  inputRange: number[];
  outputRange: number[];
} {
  const { measured, inverted, scrollViewHeight, layoutY, layoutHeight, nextHeaderLayoutY } = params;
  const inputRange: number[] = [-1, 0];
  const outputRange: number[] = [0, 0];
  if (measured) {
    if (inverted === true) {
      // Inverted: the header sticks at the BOTTOM of the viewport. It starts sticking once
      // its bottom edge reaches the viewport bottom (stickStartPoint), then tracks scroll up
      // to the next header's collision point.
      if (scrollViewHeight !== undefined) {
        const stickStartPoint = layoutY + layoutHeight - scrollViewHeight;
        if (stickStartPoint > 0) {
          inputRange.push(stickStartPoint, stickStartPoint + 1);
          outputRange.push(0, 1);
          const collisionPoint = (nextHeaderLayoutY ?? 0) - layoutHeight - scrollViewHeight;
          if (collisionPoint > stickStartPoint) {
            inputRange.push(collisionPoint, collisionPoint + 1);
            outputRange.push(collisionPoint - stickStartPoint, collisionPoint - stickStartPoint);
          }
        }
      }
    } else {
      // Top: no translation until the header reaches the top (layoutY), then it tracks the
      // scroll 1:1 to stay pinned, until the next header pushes it back off.
      inputRange.push(layoutY);
      outputRange.push(0);
      const collisionPoint = (nextHeaderLayoutY ?? 0) - layoutHeight;
      if (collisionPoint >= layoutY) {
        inputRange.push(collisionPoint, collisionPoint + 1);
        outputRange.push(collisionPoint - layoutY, collisionPoint - layoutY);
      } else {
        inputRange.push(layoutY + 1);
        outputRange.push(1);
      }
    }
  }
  return { inputRange, outputRange };
}

// The cross-talk lookup (RN's _headerLayoutYs, ScrollView.js:1695 nextIndex): given this
// header's position in `stickyHeaderIndices` (indexOfIndex), find the measured y of the NEXT
// flagged header, its collision point. undefined until that header has measured (or for the
// last flagged header, which has no successor and so sticks indefinitely).
export function nextStickyHeaderY(
  stickyHeaderIndices: number[],
  indexOfIndex: number,
  headerLayoutYs: ReadonlyMap<number, number>,
): number | undefined {
  const nextIndex = stickyHeaderIndices[indexOfIndex + 1];
  return nextIndex === undefined ? undefined : headerLayoutYs.get(nextIndex);
}
