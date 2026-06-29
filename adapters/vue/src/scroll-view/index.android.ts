// ScrollView on Android (ADR 0024 Phase 2). An Android ScrollView accepts only ONE child, so a
// RefreshControl can't be a sibling of the content the way iOS allows ("addViewAt: failed to insert
// view ... at index 1"). Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the scroll
// view, with the scroll view nested inside and nestedScrollEnabled so the inner scroll handles the
// gesture before the refresh parent, mirroring RN's ScrollView.js android branch.
//
// React does this with cloneElement(refreshControl, {style}, scrollView). Vue has NO cloneElement,
// so the analog is to RE-INVOKE the user's RefreshControl component type via h(): same .type, its
// own .props plus the injected outer/layout style, and the inner scroll view as its DEFAULT SLOT.
// The slot is the seam: RefreshControl renders slots.default() as the host node's children. The
// node ref stays on the INNER scroll view (not the wrapper), so dispatchViewCommand targets it.
// Metro picks this on an Android host; no Platform.OS read.
// device-verify-pending: the wrap shape mirrors RN, proven on a real host by the absence of the
// "addViewAt: failed to insert" crash.

import { h, isVNode, type Component, type VNode } from '@vue/runtime-core';
import { dlog } from '@symbiote/engine';
import { splitLayoutProps } from '@symbiote/components';
import { createScrollView } from './shared';
export type { IScrollViewProps, IScrollViewHandle } from './shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A Vue VNode's `.type` is VNodeTypes (string | Component | nested VNode | the Fragment/Text/…
// symbol constants). Re-invoking via h() needs it narrowed to what h accepts (string | Component):
// the symbol constants fail the typeof checks and a nested VNode is ruled out by isVNode. A type
// predicate (not a plain return) sidesteps the assignability gap; refreshControl is always a real
// component element in practice.
function isHostType(type: VNode['type']): type is string | Component {
  if (typeof type === 'string') return true;
  return (
    (typeof type === 'object' || typeof type === 'function') && type !== null && !isVNode(type)
  );
}

export const ScrollView = createScrollView({
  assemble: input => {
    if (input.refreshControl === undefined) {
      // No refresh: the same single-child path as Phase 1; the node ref rides input.scrollProps.
      dlog('Vue ScrollView.ANDROID refreshControl=NONE(1child)');
      return h(input.scrollViewIntrinsic, input.scrollProps, [input.content]);
    }

    // RN splits the flattened style across the two boxes (splitLayoutProps): LAYOUT props
    // (margin/flex/size/position/…) drive the outer AndroidSwipeRefreshLayout frame; VISUAL props
    // (background/padding/border/…) paint the inner scroll view. So the wrapper carries `outer`, and
    // the inner scroll view its base (flexDirection/overflow) plus the visual `inner` composed over
    // it, NOT a hardcoded flex:1 that would override an explicit user height/width.
    const { outer, inner } = splitLayoutProps(input.userStyle);
    const innerScrollView = h(
      input.scrollViewIntrinsic,
      {
        ...input.scrollOuterProps,
        style: [input.scrollViewBaseStyle, inner],
        nestedScrollEnabled: true,
        ref: input.setNodeRef,
      },
      [input.content],
    );

    const rc = input.refreshControl;
    if (!isHostType(rc.type)) {
      // refreshControl is always a component VNode; a symbol/nested-VNode type can't host children.
      // Degrade to the unwrapped scroll view rather than crash (the node ref is already on it).
      dlog(
        'Vue ScrollView.ANDROID refreshControl has no hostable type, rendering scroll view unwrapped',
      );
      return innerScrollView;
    }
    const rcProps = isRecord(rc.props) ? rc.props : {};
    dlog('Vue ScrollView.ANDROID refreshControl=WRAP');
    // Re-invoke the user's RefreshControl: same type, its own props + the outer/layout style, and the
    // inner scroll view as the default slot (the Vue analog of cloneElement(refreshControl, {style}, sv)).
    return h(rc.type, { ...rcProps, style: outer }, { default: () => [innerScrollView] });
  },
});
