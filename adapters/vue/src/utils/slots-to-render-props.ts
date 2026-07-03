// Bridges Vue scoped slots to the render-function / render-component surface the shared list
// windowing layer (@symbiotejs/components) expects. The Vue-facing list API is slots
// (#item / #separator / #header / #footer / #empty / #sectionHeader / #sectionFooter /
// #sectionSeparator) — the idiomatic Vue surface; React's twin is the renderItem /
// ItemSeparatorComponent prop family. This is the ONE place that translation lives, so a list's
// own body reads a single source (its slots), never a renderItem prop. Vue-only lifecycle glue,
// so it belongs in the adapter (adapters_stay_thin): the shared windowing math is untouched.

import { type Component, type VNode } from '@vue/runtime-core';

// A scoped slot may return one root or many (the natural Vue idiom: `#item` can be a single
// element or a fragment). The list cell renderer accepts the same union, and Vue flattens a
// nested array of children, so no Fragment wrap is needed — a slot fn IS the render fn.
type ISlotFn<Props extends Record<string, unknown>> = (props: Props) => VNode[] | VNode;

// A component-style renderer (ItemSeparatorComponent / SectionSeparatorComponent) is invoked by the
// list as h(component, props). Expose the slot as a functional component so its scope props reach
// the slot body. The cell renderer (#item) and the scopeless chrome slots (#header / #footer /
// #empty) need no wrapper — a slot fn is already a valid render fn / functional component.
export function componentFromSlot<Props extends Record<string, unknown>>(
  slot: ISlotFn<Props> | undefined,
): Component | undefined {
  if (slot === undefined) return undefined;
  const fromSlot = (props: Props): VNode[] | VNode => slot(props);
  return fromSlot;
}
