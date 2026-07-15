// Integration coverage: run the real Angular runtime (createComponent + RendererFactory2)
// over the headless fake Fabric slot. Unlike renderer.test.ts, this proves mount() wires
// Angular's bootstrap to the Symbiote renderer, so a standalone template paints and updates
// through the engine.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './index';

const ROOT_TAG = 808;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const drainAngularAndCommit = async (): Promise<void> => {
  await tick();
  await tick();
};

class TestView {}
Component({
  selector: 'symbiote-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestView);

class TestText {}
Component({
  selector: 'symbiote-text',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestText);

class SmokeComponent {
  name = 'Angular';
  count = 0;
  boxStyle = { padding: 12 };

  increment(): void {
    this.count += 1;
  }
}

Component({
  selector: 'symbiote-angular-smoke',
  standalone: true,
  imports: [TestView, TestText],
  template: `<symbiote-view [style]="boxStyle"><symbiote-text>Hello {{ name }}</symbiote-text><symbiote-view testID="counter" (press)="increment()"><symbiote-text>tapped {{ count }}×</symbiote-text></symbiote-view></symbiote-view>`,
})(SmokeComponent);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// A plain (non-OnPush) child component compiles as SignalView in Angular 20+, so an UNTOUCHED
// sibling child is skipped by the per-view CheckAlways/Dirty/RefreshView gate inside
// detectChangesInView — true with or without ApplicationRef (the gate lives inside
// detectChangesInView regardless of who calls it). This is NOT a claim that the root's own
// template is spared: markViewDirty (used by both native (event) bindings and
// ChangeDetectorRef.markForCheck(), see SymbioteHostPropsDirective) unconditionally sets
// RefreshView on every ancestor up to the root — a press anywhere always re-runs the root's
// own template, in every Angular app, regardless of scheduler. What this guards is narrower
// but still real: a SIBLING component with no dirty descendant of its own must not be dragged
// along for the ride.
let unrelatedRenderCount = 0;
class CounterChild {
  count = 0;

  increment(): void {
    this.count += 1;
  }
}
Component({
  selector: 'counter-child',
  standalone: true,
  imports: [TestView, TestText],
  template:
    '<symbiote-view testID="counter" (press)="increment()"><symbiote-text>tapped {{ count }}×</symbiote-text></symbiote-view>',
})(CounterChild);

class UnrelatedSiblingChild {
  trackRender(): number {
    unrelatedRenderCount++;
    return unrelatedRenderCount;
  }
}
Component({
  selector: 'unrelated-sibling-child',
  standalone: true,
  template: '<symbiote-text>unrelated {{ trackRender() }}</symbiote-text>',
})(UnrelatedSiblingChild);

class TargetedComponent {}
Component({
  selector: 'symbiote-angular-targeted',
  standalone: true,
  imports: [TestView, CounterChild, UnrelatedSiblingChild],
  template: `<symbiote-view><counter-child /><unrelated-sibling-child /></symbiote-view>`,
})(TargetedComponent);

describe('Angular mount', () => {
  it('bootstraps a standalone component into a committed Fabric tree', async () => {
    mount(ROOT_TAG, SmokeComponent);
    await tick();

    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe(
      'RCTView(RCTText(RCTRawText "Hello Angular")RCTView(RCTText(RCTRawText "tapped 0×")))',
    );
    expect(root.children[0]?.props).toMatchObject({ padding: 12 });
  });

  it('runs Angular change detection after a native press and recommits text', async () => {
    mount(ROOT_TAG, SmokeComponent);
    await tick();

    const counter = fabric.find(node => node.props.testID === 'counter');
    expect(counter).toBeDefined();

    fabric.fireEvent(counter?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchEnd');
    await drainAngularAndCommit();

    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 1×"');
  });

  it('does not re-check a sibling child component on a press inside a different child', async () => {
    unrelatedRenderCount = 0;
    mount(ROOT_TAG, TargetedComponent);
    await tick();

    const afterFirstPaint = unrelatedRenderCount;
    expect(afterFirstPaint).toBeGreaterThan(0);

    const counter = fabric.find(node => node.props.testID === 'counter');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchEnd');
    await drainAngularAndCommit();

    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 1×"');
    // UnrelatedSiblingChild has no dirty descendant of its own, so it must not be re-checked
    // just because CounterChild (a completely separate branch) got pressed. This does NOT prove
    // the root's own template stays untouched — the root's template still re-runs on every
    // press (see render.ts).
    expect(unrelatedRenderCount).toBe(afterFirstPaint);
  });
});
