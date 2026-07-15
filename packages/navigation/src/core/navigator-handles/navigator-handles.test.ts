import { describe, expect, it } from 'vitest';
import { isDrawerNavigatorHandle, isStackNavigatorHandle, isTabNavigatorHandle } from './index';
import type { IDrawerNavigatorHandle, INavigatorHandle, ITabNavigatorHandle } from './index';

const stackHandle: INavigatorHandle = {
  push: () => {},
  pop: () => {},
  popToTop: () => {},
  popTo: () => {},
  replace: () => {},
  setParams: () => {},
  reset: () => {},
  canGoBack: () => false,
};

const tabHandle: ITabNavigatorHandle = {
  jumpTo: () => {},
  setParams: () => {},
};

const drawerHandle: IDrawerNavigatorHandle = {
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  jumpTo: () => {},
};

describe('navigator handle guards', () => {
  it('identifies a Stack handle by push and rules out Tab/Drawer', () => {
    expect(isStackNavigatorHandle(stackHandle)).toBe(true);
    expect(isTabNavigatorHandle(stackHandle)).toBe(false);
    expect(isDrawerNavigatorHandle(stackHandle)).toBe(false);
  });

  it('identifies a Tab handle by jumpTo without openDrawer', () => {
    expect(isTabNavigatorHandle(tabHandle)).toBe(true);
    expect(isStackNavigatorHandle(tabHandle)).toBe(false);
    expect(isDrawerNavigatorHandle(tabHandle)).toBe(false);
  });

  it('identifies a Drawer handle by openDrawer, even though it also has jumpTo', () => {
    expect(isDrawerNavigatorHandle(drawerHandle)).toBe(true);
    expect(isTabNavigatorHandle(drawerHandle)).toBe(false);
    expect(isStackNavigatorHandle(drawerHandle)).toBe(false);
  });
});
