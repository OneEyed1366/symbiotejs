// Regression tests for two Android-only bugs AnimatedScrollView's bespoke template hit because
// it talks to the raw symbiote-scroll-view primitive directly instead of reusing the real
// ScrollView component (which already has both fixes — see scroll-view/shared.ts):
//
// 1. It projected <ng-content> straight into symbiote-scroll-view with no content wrapper. On
//    Android, symbiote-scroll-content resolves to a plain RCTView, which Fabric view-flattens
//    away unless collapsable:false pins it — so multiple projected children were hoisted up as
//    direct children of the scroll view, which natively hosts exactly one ("ScrollView can
//    host only one direct child" -> addViewAt crash).
// 2. It never defaulted nestedScrollEnabled. RN defaults nested scrolling ON (ScrollView.js
//    `nestedScrollEnabled ?? true`), but Android needs it explicit or a ScrollView nested
//    inside another scrollable container (this canary's own nested demo) never receives touch
//    — it renders fine but is static, the outer ScrollView swallows the gesture.
//
// The fake Fabric harness doesn't simulate Android's real view-flattening or touch dispatch, so
// these tests only prove the structural/prop invariants that prevent both bugs, not the
// on-device symptoms themselves — those still need a real Android host.
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { AnimatedScrollView } from './create-animated-component';

const ROOT_TAG = 927;
const OVERRIDE_ROOT_TAG = 928;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

class AnimatedScrollViewApp {}
Component({
  selector: 'animated-scroll-view-test',
  standalone: true,
  imports: [AnimatedScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <AnimatedScrollView>
      <symbiote-view testID="a"></symbiote-view>
      <symbiote-view testID="b"></symbiote-view>
    </AnimatedScrollView>
  `,
})(AnimatedScrollViewApp);

class AnimatedScrollViewOverrideApp {}
Component({
  selector: 'animated-scroll-view-override-test',
  standalone: true,
  imports: [AnimatedScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <AnimatedScrollView [animatedProps]="{ nestedScrollEnabled: false }">
      <symbiote-view testID="a"></symbiote-view>
    </AnimatedScrollView>
  `,
})(AnimatedScrollViewOverrideApp);

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  unmount(OVERRIDE_ROOT_TAG);
});

describe('AnimatedScrollView', () => {
  it('wraps multiple projected children in a single non-collapsable content view', async () => {
    mount(ROOT_TAG, AnimatedScrollViewApp);
    await tick();

    const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(scrollView?.children).toHaveLength(1);
    expect(scrollView?.props.nestedScrollEnabled).toBe(true);

    const content = scrollView?.children[0];
    expect(content?.viewName).toBe('RCTScrollContentView');
    expect(content?.props.collapsable).toBe(false);
    expect(content?.children.map(child => child.props.testID)).toEqual(['a', 'b']);
  });

  // Regression test for a THIRD bug in this same bespoke-template class, this one iOS-only (the
  // inverse of the two Android bugs above): AnimatedScrollView never applied
  // selectScrollIntrinsics' scrollViewBaseStyle (overflow: 'scroll') to its host node, unlike the
  // real ScrollView component. On iOS Fabric a scroll view only clips its content to its own
  // frame when `overflow: 'scroll'` is set; without it, content taller than the frame bleeds out
  // over sibling views instead of scrolling clipped (Android's native ViewGroup clips regardless
  // of the style prop, which is why this was invisible there). See
  // core/components/src/view/render-scroll-view.ts's SCROLL_VIEW_BASE_VERTICAL comment.
  it('applies the scroll-view base style (overflow: scroll) so content clips to the frame', async () => {
    mount(ROOT_TAG, AnimatedScrollViewApp);
    await tick();

    const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(scrollView?.props.overflow).toBe('scroll');
    expect(scrollView?.props.flexDirection).toBe('column');
  });

  it('lets an explicit nestedScrollEnabled in animatedProps override the default', async () => {
    mount(OVERRIDE_ROOT_TAG, AnimatedScrollViewOverrideApp);
    await tick();

    const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(scrollView?.props.nestedScrollEnabled).toBe(false);
  });
});
