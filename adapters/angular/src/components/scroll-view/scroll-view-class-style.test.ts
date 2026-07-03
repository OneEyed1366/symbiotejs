// Regression test for the anchor/class bug (angular-adapter skill): a composed component's own
// use-site `class="..."` resolves through Angular's addClass/removeClass onto the component's
// non-painting ANCHOR host (ANCHOR_HOST_COMPONENTS in renderer.ts), never onto the real Fabric
// node its own template renders — so the resolved style was silently lost. Fixed via
// anchorHostStyle(this.elementRef) merged into ScrollView's own scrollProps/androidWrappedScrollProps
// getters (see index.ios.ts / index.android.ts). Mirrors pressable.test.ts's "resolves a class=" case,
// covering BOTH platforms and the Android refresh-control-wrapped branch (androidWrappedScrollProps
// is a SEPARATE override from scrollProps, since it recomputes `style` from scratch rather than
// inheriting the base getter's result).
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { RefreshControl } from '../refresh-control';
import { ScrollView as AndroidScrollView } from './index.android';
import { ScrollView as IOSScrollView } from './index.ios';

const ROOT_TAG = 950;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-scroll-ios-class-host',
  standalone: true,
  imports: [IOSScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="card">
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class IOSScrollViewClassHost {}

@Component({
  selector: 'symbiote-scroll-android-class-host',
  standalone: true,
  imports: [AndroidScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="card">
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class AndroidScrollViewClassHost {}

@Component({
  selector: 'symbiote-scroll-android-wrapped-class-host',
  standalone: true,
  imports: [AndroidScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="card">
      <RefreshControl [refreshing]="true" (refresh)="refresh()" />
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class AndroidWrappedScrollViewClassHost {
  refresh = (): void => undefined;
}

@Component({
  selector: 'symbiote-scroll-android-wrapped-layout-class-host',
  standalone: true,
  imports: [AndroidScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="box">
      <RefreshControl [refreshing]="true" (refresh)="refresh()" />
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class AndroidWrappedScrollViewLayoutClassHost {
  refresh = (): void => undefined;
}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' }, box: { flex: 1, height: 84 } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ScrollView anchor class= resolution', () => {
  it('resolves a class= on the iOS ScrollView use site onto the real committed scroll host', async () => {
    mount(ROOT_TAG, IOSScrollViewClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });

  it('resolves a class= on the Android ScrollView use site (no refresh control)', async () => {
    mount(ROOT_TAG, AndroidScrollViewClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });

  it('resolves a class= on the Android ScrollView use site wrapped by a projected RefreshControl', async () => {
    mount(ROOT_TAG, AndroidWrappedScrollViewClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });

  // Regression for a real device bug distinct from the one above: a class-derived LAYOUT
  // property (flex/height/…) must reach the OUTER refresh-control wrapper via splitLayoutProps,
  // not just the inner scroll view — a class carrying only a color property (the test above)
  // never exercises this split at all, since color is never a layout key. Without
  // `layoutSplitStyle` feeding the anchor's style INTO the split (not tacked on after), the
  // wrapper never receives its flex/height share and collapses to zero size — the whole
  // ScrollView renders nothing on a real Android device. Mirrors the Vue adapter's identical
  // `layoutSplitStyle` fix (same root cause, same symptom).
  it('resolves a class-derived LAYOUT style onto the Android outer refresh-control wrapper', async () => {
    mount(ROOT_TAG, AndroidWrappedScrollViewLayoutClassHost);
    await tick();

    const wrapper = fabric.find(n => n.props.refreshing === true);
    expect(wrapper, 'the outer refresh-control wrapper committed').toBeDefined();
    expect(wrapper?.props.flex).toBe(1);
    expect(wrapper?.props.height).toBe(84);
  });
});
