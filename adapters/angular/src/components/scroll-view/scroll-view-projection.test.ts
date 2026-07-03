import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';
import { mount, unmount } from '../../render';
import { RefreshControl } from '../refresh-control';
import { ScrollView as AndroidScrollView } from './index.android';
import { ScrollView } from './index.ios';

const ROOT_TAG = 918;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

class StickyProjectionApp {}
Component({
  selector: 'symbiote-scroll-sticky-projection-test',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [stickyHeaderIndices]="[1]">
      <symbiote-view testID="before"></symbiote-view>
      <symbiote-view testID="sticky"></symbiote-view>
      <symbiote-view testID="after"></symbiote-view>
    </ScrollView>
  `,
})(StickyProjectionApp);

class CustomStickyHeader {
  static instantiated = false;

  constructor() {
    CustomStickyHeader.instantiated = true;
  }
}
Component({
  selector: 'CustomStickyHeader',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <symbiote-view testID="custom-sticky-wrapper">
      <ng-content></ng-content>
    </symbiote-view>
  `,
})(CustomStickyHeader);

class CustomStickyProjectionApp {
  CustomStickyHeader = CustomStickyHeader;
}
Component({
  selector: 'symbiote-scroll-custom-sticky-projection-test',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [stickyHeaderIndices]="[0]" [StickyHeaderComponent]="CustomStickyHeader">
      <symbiote-view testID="sticky"></symbiote-view>
      <symbiote-view testID="after"></symbiote-view>
    </ScrollView>
  `,
})(CustomStickyProjectionApp);

class IOSRefreshProjectionApp {
  static refreshes = 0;

  readonly refreshing = signal(false);

  refresh = (): void => {
    this.refreshing.set(true);
    setTimeout(() => {
      this.refreshing.set(false);
      IOSRefreshProjectionApp.refreshes += 1;
    }, 0);
  };
}
Component({
  selector: 'symbiote-scroll-ios-refresh-projection-test',
  standalone: true,
  imports: [ScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView>
      <RefreshControl [refreshing]="refreshing()" (refresh)="refresh()" />
      <symbiote-view testID="content"></symbiote-view>
    </ScrollView>
  `,
})(IOSRefreshProjectionApp);

class AndroidRefreshProjectionApp {
  static refreshes = 0;

  refresh = (): void => {
    AndroidRefreshProjectionApp.refreshes += 1;
  };
}
Component({
  selector: 'symbiote-scroll-android-refresh-projection-test',
  standalone: true,
  imports: [AndroidScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [style]="{ marginTop: 4, backgroundColor: 'red' }">
      <RefreshControl [refreshing]="true" (refresh)="refresh()" />
      <symbiote-view testID="content"></symbiote-view>
    </ScrollView>
  `,
})(AndroidRefreshProjectionApp);

beforeEach(() => {
  fabric.reset();
  CustomStickyHeader.instantiated = false;
  IOSRefreshProjectionApp.refreshes = 0;
  AndroidRefreshProjectionApp.refreshes = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Angular ScrollView projection parity', () => {
  it('auto-wraps projected children selected by stickyHeaderIndices', async () => {
    mount(ROOT_TAG, StickyProjectionApp);
    await tick();

    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe(
      'RCTScrollView(RCTScrollContentView(RCTViewRCTView(RCTView)RCTView))',
    );

    const stickyWrapper = fabric.find(
      node =>
        node.props.collapsable === false &&
        node.children.some(child => child.props.testID === 'sticky'),
    );
    expect(stickyWrapper?.props).toMatchObject({ collapsable: false, onLayout: true });
  });

  it('keeps auto StickyHeaderComponent projection on the built-in AOT-safe wrapper', async () => {
    mount(ROOT_TAG, CustomStickyProjectionApp);
    await tick();

    expect(CustomStickyHeader.instantiated).toBe(false);
    expect(fabric.find(node => node.props.testID === 'custom-sticky-wrapper')).toBeUndefined();

    const stickyWrapper = fabric.find(
      node =>
        node.props.collapsable === false &&
        node.children.some(child => child.props.testID === 'sticky'),
    );
    expect(stickyWrapper?.props).toMatchObject({ collapsable: false, onLayout: true });
  });

  it('renders iOS RefreshControl before content and syncs the controlled native spinner', async () => {
    mount(ROOT_TAG, IOSRefreshProjectionApp);
    await tick();

    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe(
      'RCTScrollView(PullToRefreshViewRCTScrollContentView(RCTView))',
    );

    const refresh = root.children[0]?.children[0];
    expect(refresh?.viewName).toBe('PullToRefreshView');
    fabric.fireEvent(refresh?.instanceHandle, 'topRefresh');
    await tick();
    await tick();

    expect(IOSRefreshProjectionApp.refreshes).toBe(1);
    expect(fabric.commands.at(-1)).toMatchObject({
      commandName: 'setNativeRefreshing',
      args: [false],
    });
    expect(fabric.commands.at(-1)?.node.tag).toBe(refresh?.tag);
  });

  it('wraps an Android projected RefreshControl around the scroll view', async () => {
    mount(ROOT_TAG, AndroidRefreshProjectionApp);
    await tick();

    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe(
      'PullToRefreshView(RCTScrollView(RCTScrollContentView(RCTView)))',
    );

    const refresh = root.children[0];
    expect(refresh?.props).toMatchObject({ refreshing: true, marginTop: 4 });
    fabric.fireEvent(refresh?.instanceHandle, 'topRefresh');
    await tick();

    expect(AndroidRefreshProjectionApp.refreshes).toBe(1);
    expect(refresh?.children[0]?.props).toMatchObject({
      backgroundColor: 'red',
      nestedScrollEnabled: true,
    });
    expect(fabric.find(node => node.props.testID === 'content')).toBeDefined();
  });
});
