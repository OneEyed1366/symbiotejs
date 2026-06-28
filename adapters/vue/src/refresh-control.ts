// RefreshControl, the Vue lifecycle half (ADR 0024 Phase 2). On iOS this is the PullToRefreshView
// Fabric node that lives INSIDE a ScrollView (a sibling before the content container); on Android it
// is AndroidSwipeRefreshLayout and WRAPS the scroll view (a ScrollView there hosts one child). The
// Vue twin of the React adapter's RefreshControl. Vue takes the wrapped child via its DEFAULT SLOT
// (the seam the Android scroll-view wrap re-invokes to host the scroll view inside it; iOS leaves the
// slot empty), folds aria/role through the shared resolveAccessibilityProps, and forwards the native
// props onto the symbiote-refresh-control host node.
//
// `refreshing` is a controlled prop: the parent owns it and pushes it down each commit; native
// reports the gesture via the direct `topRefresh` event, which the engine routes to the `refresh`
// listener (onRefresh). Inputs arrive as attrs (untyped), so the forwarded bag is BUILT at the
// a11y-intersection type (a genuine narrowing, not a cast) before the aria fold.

import { defineComponent, h, type SetupContext } from '@vue/runtime-core';
import { dlog } from '@symbiote/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote/components';
import { normalizeVueAttrs } from './normalize-attrs';

// The Vue-facing prop surface. Mirrors React's RefreshControlProps (read it for the native prop
// names) minus React `children`: Vue hosts the wrapped scroll view via the default slot. There is
// no JS-side platform renaming: every prop forwards straight to the native node, which reads the
// ones it understands (PullToRefreshView on iOS, AndroidSwipeRefreshLayout on Android) and ignores
// the rest, so the Android-only and iOS-only families ride down harmlessly on both.
export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // RN's onRefresh is `() => void | Promise<void>`: the handler may be async; the promise is
  // fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RN RefreshControlPropsAndroid): `colors` are the indicator's
  // animated stroke colors, `progressBackgroundColor` the disc behind it, `size` the diameter
  // preset. AndroidSwipeRefreshLayout reads them; PullToRefreshView ignores unknown props.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop forwarded to AndroidSwipeRefreshLayout; iOS native never reads it.
  enabled?: boolean;
}

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

// Copy every attr into a bag typed as the a11y intersection (the accumulator is BUILT at that type,
// a real narrowing, not a cast), then fold aria-*/role into the canonical accessibility* props.
// Children cross via slots, never attrs, so nothing is stripped here. When the Android wrap
// re-invokes this component, the injected `style` (the outer/layout half) rides through too.
function foldAttrs(attrs: Record<string, unknown>): IForwardBag {
  const bag: IForwardBag = {};
  for (const key of Object.keys(attrs)) bag[key] = attrs[key];
  return resolveAccessibilityProps(bag);
}

export const RefreshControl = defineComponent({
  name: 'RefreshControl',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, slots }: SetupContext) {
    return () => {
      const nativeProps = foldAttrs(normalizeVueAttrs(rawAttrs));
      dlog('RefreshControl -> PullToRefreshView');
      dlog(`RefreshControl refreshing=${String(nativeProps.refreshing)}`);
      if (nativeProps.enabled !== undefined)
        dlog(`RefreshControl enabled=${String(nativeProps.enabled)} (Android-only)`);
      if (nativeProps.onRefresh !== undefined) dlog('RefreshControl onRefresh listener wired');
      // The default slot is the seam: empty on iOS (childless sibling), but the Android scroll-view
      // wrap re-invokes this component with the scroll view as its default slot, so it hosts it.
      return h(
        'symbiote-refresh-control',
        nativeProps,
        slots.default !== undefined ? slots.default() : undefined,
      );
    };
  },
});
