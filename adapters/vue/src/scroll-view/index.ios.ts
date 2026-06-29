// ScrollView on iOS (ADR 0024 Phase 2). The RefreshControl is a CHILD of the scroll view, rendered
// as a SIBLING BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}).
// The user's RefreshControl VNode renders as-is; its default slot is empty on iOS, so it is a
// childless sibling. Also the base (scroll-view.ts re-exports it) for headless / web. Metro picks
// this on an iOS host; no Platform.OS read. Mirrors the React adapter's iOS binding.

import { h } from '@vue/runtime-core';
import { createScrollView } from './shared';
export type { IScrollViewProps, IScrollViewHandle } from './shared';

export const ScrollView = createScrollView({
  assemble: input => {
    // Sibling placement: RefreshControl before content (RN iOS). The node ref stays on the scroll
    // view via input.scrollProps, so the imperative handle targets it whether or not refresh is on.
    const children =
      input.refreshControl === undefined ? [input.content] : [input.refreshControl, input.content];
    return h(input.scrollViewIntrinsic, input.scrollProps, children);
  },
});
