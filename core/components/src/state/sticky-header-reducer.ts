// Sticky-header effect machine: the framework-agnostic STATE MACHINE that folds every per-adapter
// sticky-header effect skeleton into one place. Before this, each adapter (React useState/useEffect,
// Vue refs/watchEffect, Angular fields/ngOnChanges — and, in Angular, a SECOND copy inside the
// projection wrapper) re-wrote the same per-header sequence — gate the freshly-rebuilt
// interpolation's spurious zero, debounce the settled translateY, rebuild the top/inverted ranges on
// a layout/collision-input change — in its own reactive dialect, so the zero-swallow gate, the
// debounce-delay pick, and the rebuild decision lived FOUR times and quietly drifted.
//
// Here the whole decision half is one pure `reduceSticky(state, action, inputs) -> {state, effects}`,
// PER sticky header. The adapter keeps only what is genuinely framework-bound: translate a native
// event / animated tick / timer fire into an ACTION, hold ONE state cell, and EXECUTE the returned
// EFFECTS with its own primitives (build the interpolation node + wire addListener/removeListener,
// hold the debounce setTimeout, trigger its own re-render, record the cross-talk y). The math leaf
// (computeStickyInterpolation) and the debounce-window pick (stickyDebounceMs) still live in
// ./view/render-scroll-sticky; this module composes them into the ordered transition every adapter
// shares. Ported from ScrollViewStickyHeader.js's effect.

import { dlog } from '@symbiote-native/engine';
import { computeStickyInterpolation, stickyDebounceMs } from '../view/render-scroll-sticky';

// The un-measured identity interpolation (RN: a fresh AnimatedInterpolation before the header has
// measured its own y/height). Kept as the reset the initial state and every rebuild start from.
const IDENTITY_INPUT_RANGE: readonly number[] = [-1, 0];
const IDENTITY_OUTPUT_RANGE: readonly number[] = [0, 0];
const NO_TRANSLATE = null;

// One sticky header's folded state — everything scattered across each adapter's useState/refs/fields.
// `inputRange`/`outputRange` are the derived interpolation ranges the adapter feeds into its
// scrollAnimatedValue.interpolate(); `translateY` is the debounced EXPLICIT value pushed to the
// committed transform (null until the debounce first fires). The adapter holds ONE reference to this
// and re-reads it after each reduceSticky call.
export interface IStickyHeaderState {
  measured: boolean;
  layoutY: number;
  layoutHeight: number;
  // The debounced committed translateY (RN's passthroughAnimatedPropExplicitValues). null = none yet.
  translateY: number | null;
  // Re-armed swallow gate: a freshly-rebuilt interpolation re-emits 0 to its listeners; once a real
  // non-zero value has committed (flag false), the next such 0 is dropped (RN ScrollViewStickyHeader).
  haveReceivedInitialZeroTranslateY: boolean;
  inputRange: number[];
  outputRange: number[];
}

// The config the reducer reads each call (it comes off the adapter's props/inputs, so it is passed in
// rather than stored): the host OS (for the debounce window), the collision/viewport inputs the
// interpolation math reads, and — ONLY when the reducer owns the cross-talk recording (Angular's
// projection controller) — this header's own child `index`. React/Vue record through the wrapper's
// own onLayout closure (the public IStickyHeaderProps.onLayout contract), so they leave `index`
// unset and the reducer emits no record-header-y effect for them.
export interface IStickyReducerInputs {
  os: string;
  inverted: boolean | undefined;
  scrollViewHeight: number | undefined;
  // The y of the NEXT sticky header (its collision point). Changes via cross-talk as a later header
  // measures, which is exactly the `inputs-changed` recompute trigger.
  nextHeaderLayoutY: number | undefined;
  index?: number;
}

// The events the adapter turns native callbacks / imperative calls into. `layout` is the header's own
// onLayout (measured y/height); `inputs-changed` is the collision/viewport recompute signal
// (inverted / scrollViewHeight / nextHeaderLayoutY changed); `animated-tick` is the interpolation
// listener firing; `debounce-fired` is the adapter's debounce timer completing.
export type IStickyAction =
  | { kind: 'layout'; y: number; height: number }
  | { kind: 'inputs-changed' }
  | { kind: 'animated-tick'; value: number }
  | { kind: 'debounce-fired'; value: number };

// The work the adapter executes with its own primitives. `rebuild-interpolation` carries the fresh
// ranges to build a new scrollAnimatedValue.interpolate() node onto and re-wire the settled-value
// listener; `schedule-debounce` carries the host debounce `delay` and the `value` to commit when it
// fires; `apply-passthrough` is the settled translateY to push into the committed transform;
// `record-header-y` feeds this header's measured y into the parent cross-talk map (Angular projection).
export type IStickyEffect =
  | { kind: 'rebuild-interpolation'; inputRange: number[]; outputRange: number[] }
  | { kind: 'schedule-debounce'; delay: number; value: number }
  | { kind: 'apply-passthrough'; translateY: number }
  | { kind: 'record-header-y'; index: number; y: number };

export interface IStickyReduceResult {
  state: IStickyHeaderState;
  effects: IStickyEffect[];
  // Whether render-relevant state (the ranges or the committed translateY) changed, so the adapter
  // knows to re-render. A swallowed / scheduled animated tick returns false (nothing painted yet).
  changed: boolean;
}

export function createInitialStickyState(): IStickyHeaderState {
  return {
    measured: false,
    layoutY: 0,
    layoutHeight: 0,
    translateY: NO_TRANSLATE,
    haveReceivedInitialZeroTranslateY: true,
    inputRange: [...IDENTITY_INPUT_RANGE],
    outputRange: [...IDENTITY_OUTPUT_RANGE],
  };
}

// A cheap signature over the render-relevant state (the ranges + the committed translateY). The
// adapter can skip re-wiring when it is unchanged. Shared so the key CANNOT drift between adapters.
export function stickyEffectSignature(state: IStickyHeaderState): string {
  return `${state.inputRange.join(',')}|${state.outputRange.join(',')}|${state.translateY}`;
}

// Recompute the derived interpolation ranges off the current state + inputs (wrapping the load-bearing
// computeStickyInterpolation math), store them, and return them for the rebuild effect.
function deriveRanges(
  state: IStickyHeaderState,
  inputs: IStickyReducerInputs,
): { inputRange: number[]; outputRange: number[] } {
  const { inputRange, outputRange } = computeStickyInterpolation({
    measured: state.measured,
    inverted: inputs.inverted,
    scrollViewHeight: inputs.scrollViewHeight,
    layoutY: state.layoutY,
    layoutHeight: state.layoutHeight,
    nextHeaderLayoutY: inputs.nextHeaderLayoutY,
  });
  state.inputRange = inputRange;
  state.outputRange = outputRange;
  return { inputRange, outputRange };
}

// The single transition every sticky-header adapter shares. The adapter maps a native event / animated
// tick / timer fire to an action, calls this, stores the returned state, and executes the effects.
export function reduceSticky(
  state: IStickyHeaderState,
  action: IStickyAction,
  inputs: IStickyReducerInputs,
): IStickyReduceResult {
  switch (action.kind) {
    case 'layout': {
      // Record own y/height, mark measured, rebuild the interpolation, and (when the reducer owns the
      // cross-talk index) hand the parent this header's y so the PREVIOUS header learns its collision
      // point. Matches RN ScrollViewStickyHeader.js._onLayout.
      state.layoutY = action.y;
      state.layoutHeight = action.height;
      state.measured = true;
      const { inputRange, outputRange } = deriveRanges(state, inputs);
      const effects: IStickyEffect[] = [];
      if (inputs.index !== undefined) {
        effects.push({ kind: 'record-header-y', index: inputs.index, y: action.y });
      }
      effects.push({ kind: 'rebuild-interpolation', inputRange, outputRange });
      return { state, effects, changed: true };
    }
    case 'inputs-changed': {
      // A collision/viewport input changed (RN effect deps: inverted, scrollViewHeight,
      // nextHeaderLayoutY): recompute the ranges and rebuild.
      const { inputRange, outputRange } = deriveRanges(state, inputs);
      return {
        state,
        effects: [{ kind: 'rebuild-interpolation', inputRange, outputRange }],
        changed: true,
      };
    }
    case 'animated-tick': {
      // A freshly-rebuilt interpolation re-emits 0 to its listeners; swallow that first zero once a
      // real value has committed (RN). Otherwise schedule the host-tuned debounce that pushes the
      // settled value into the committed transform for hit-testing.
      if (action.value === 0 && !state.haveReceivedInitialZeroTranslateY) {
        state.haveReceivedInitialZeroTranslateY = true;
        dlog('sticky-header swallowed re-emitted zero translateY');
        return { state, effects: [], changed: false };
      }
      return {
        state,
        effects: [
          { kind: 'schedule-debounce', delay: stickyDebounceMs(inputs.os), value: action.value },
        ],
        changed: false,
      };
    }
    case 'debounce-fired': {
      // The debounce completed: commit the settled translateY. Once a NON-zero value commits, re-arm
      // the swallow gate so the next interpolation rebuild's spurious 0 is dropped (RN).
      state.translateY = action.value;
      if (action.value !== 0) state.haveReceivedInitialZeroTranslateY = false;
      return {
        state,
        effects: [{ kind: 'apply-passthrough', translateY: action.value }],
        changed: true,
      };
    }
  }
}
