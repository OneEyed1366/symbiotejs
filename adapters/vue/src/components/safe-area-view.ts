// SafeAreaView, the Vue lifecycle half (ADR 0024 Phase 2). A plain view whose native side
// insets its children to the safe area (notch, rounded corners, system bars); there is no
// JS-side translation, so this maps style + children straight onto the intrinsic. The Vue twin
// of the React adapter's SafeAreaView. Vue takes children via slots, folds aria/role through
// the shared resolveAccessibilityProps (so every adapter normalizes the web aliases identically),
// and forwards the rest onto the symbiote-safe-area-view host node.
//
// Inputs arrive as attrs (untyped), so the forwarded bag is BUILT at the a11y-intersection type
// (a genuine narrowing, not a cast) before resolveAccessibilityProps folds aria-* into accessibility*.

import { defineComponent, h, type SetupContext } from '@vue/runtime-core';
import { dlog, type IClassNameValue } from '@symbiotejs/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiotejs/components';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// The Vue-facing prop surface. React's SafeAreaViewProps is React-coupled (ReactNode children,
// StyleProp style typed locally); Vue takes children via slots and forwards style/onLayout/testID
// straight through, so this mirrors the same a11y + ViewProps surface minus React children.
export type ISafeAreaViewProps = IAccessibilityProps &
  IAriaProps & {
    // No HANDLED_ATTRS split in this file — forwards straight to the single host node like
    // every other prop here, already resolved through the shared style registry.
    class?: IClassNameValue;
  };

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

// Copy every attr into a bag typed as the a11y intersection (the accumulator is BUILT at that
// type, a real narrowing, not a cast), then fold aria-*/role into the canonical accessibility*
// props before they reach the host. style / onLayout / testID forward unchanged.
function foldAttrs(attrs: Record<string, unknown>): IForwardBag {
  const bag: IForwardBag = {};
  for (const key of Object.keys(attrs)) bag[key] = attrs[key];
  return resolveAccessibilityProps(bag);
}

export const SafeAreaView = defineComponent({
  name: 'SafeAreaView',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, slots }: SetupContext) {
    return () => {
      dlog('SafeAreaView -> SafeAreaView');
      const nativeProps = foldAttrs(normalizeVueAttrs(rawAttrs));
      return h(
        'symbiote-safe-area-view',
        nativeProps,
        slots.default !== undefined ? slots.default() : undefined,
      );
    };
  },
});
