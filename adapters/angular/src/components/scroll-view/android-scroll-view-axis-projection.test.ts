// Regression test for the Android content-projection bug documented in angular-adapter skill §18:
// ScrollView on Android picks a different native content view per axis (RCTView vs
// AndroidHorizontalScrollContentView), which used to require a separate <ng-content> per
// axis x refresh-control combination — and Angular only reliably projects into a component's
// LAST-declared <ng-content> when 2+ distinct declarations exist. Fixed by routing all four
// branches through a single shared <ng-template>/<ng-content> via a local template-outlet
// directive (see index.android.ts). Covers all four static combinations plus a runtime axis
// flip, which the projection.ts records/reconcile path must survive without dropping children.
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';
import { mount, unmount } from '../../render';
import { RefreshControl } from '../refresh-control';
import { ScrollView } from './index.android';

const ROOT_TAG = 919;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function expectCellsProjected(): void {
  expect(fabric.find(node => node.props.testID === 'a')).toBeDefined();
  expect(fabric.find(node => node.props.testID === 'b')).toBeDefined();
}

class HorizontalNoRefreshApp {}
Component({
  selector: 'axis-projection-horizontal-no-refresh',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [horizontal]="true">
      <symbiote-view testID="a"></symbiote-view>
      <symbiote-view testID="b"></symbiote-view>
    </ScrollView>
  `,
})(HorizontalNoRefreshApp);

class HorizontalRefreshApp {
  refresh = (): void => {};
}
Component({
  selector: 'axis-projection-horizontal-refresh',
  standalone: true,
  imports: [ScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [horizontal]="true">
      <RefreshControl [refreshing]="true" (refresh)="refresh()" />
      <symbiote-view testID="a"></symbiote-view>
      <symbiote-view testID="b"></symbiote-view>
    </ScrollView>
  `,
})(HorizontalRefreshApp);

class VerticalNoRefreshApp {}
Component({
  selector: 'axis-projection-vertical-no-refresh',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView>
      <symbiote-view testID="a"></symbiote-view>
      <symbiote-view testID="b"></symbiote-view>
    </ScrollView>
  `,
})(VerticalNoRefreshApp);

class AxisSwitchApp {
  static readonly horizontal = signal(false);
  get isHorizontal(): boolean {
    return AxisSwitchApp.horizontal();
  }
}
Component({
  selector: 'axis-projection-axis-switch',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [horizontal]="isHorizontal">
      <symbiote-view testID="a"></symbiote-view>
      <symbiote-view testID="b"></symbiote-view>
    </ScrollView>
  `,
})(AxisSwitchApp);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Android ScrollView projects content across every axis x refresh combination', () => {
  it('horizontal, no refresh control', async () => {
    mount(ROOT_TAG, HorizontalNoRefreshApp);
    await tick();
    expectCellsProjected();
  });

  it('horizontal, with a projected refresh control', async () => {
    mount(ROOT_TAG, HorizontalRefreshApp);
    await tick();
    expectCellsProjected();
  });

  it('vertical, no refresh control', async () => {
    mount(ROOT_TAG, VerticalNoRefreshApp);
    await tick();
    expectCellsProjected();
  });

  it('survives a runtime vertical -> horizontal axis switch', async () => {
    AxisSwitchApp.horizontal.set(false);
    mount(ROOT_TAG, AxisSwitchApp);
    await tick();
    expectCellsProjected();

    AxisSwitchApp.horizontal.set(true);
    await tick();
    await tick();
    expectCellsProjected();
  });
});
