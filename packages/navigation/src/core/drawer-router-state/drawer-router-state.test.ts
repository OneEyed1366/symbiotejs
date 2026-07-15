// Co-located unit test (ADR 0025) for the pure drawer router reducer - sibling to
// navigator-state.test.ts (stack). Unlike the stack's push/pop array, the drawer's route list
// never changes shape (see drawer-router-state.ts's header): only which route is focused
// (`index`) and whether the panel is open (`isOpen`) can change, so every action here is a
// jumpTo/open/close/toggle over a FIXED route array.

import { describe, expect, it } from 'vitest';
import { createInitialDrawerRouterState, drawerRouterReducer, focusedDrawerRoute } from './index';
import type { IDrawerRouterState } from './index';

const HOME = { key: 'home-1', name: 'Home', params: undefined };
const PROFILE = { key: 'profile-1', name: 'Profile', params: { tab: 'feed' } };
const SETTINGS = { key: 'settings-1', name: 'Settings', params: undefined };

function closedState(index = 0): IDrawerRouterState {
  return { routes: [HOME, PROFILE, SETTINGS], index, isOpen: false };
}

function openState(index = 0): IDrawerRouterState {
  return { routes: [HOME, PROFILE, SETTINGS], index, isOpen: true };
}

describe('createInitialDrawerRouterState', () => {
  it('focuses the first route and starts closed when no initialRouteName is given', () => {
    expect(createInitialDrawerRouterState([HOME, PROFILE])).toEqual({
      routes: [HOME, PROFILE],
      index: 0,
      isOpen: false,
    });
  });

  it('focuses the route matching initialRouteName', () => {
    const state = createInitialDrawerRouterState([HOME, PROFILE, SETTINGS], 'Settings');
    expect(state.index).toBe(2);
    expect(state.isOpen).toBe(false);
  });

  it('falls back to the first route when initialRouteName matches nothing', () => {
    expect(createInitialDrawerRouterState([HOME, PROFILE], 'Nowhere').index).toBe(0);
  });
});

describe('drawerRouterReducer — jumpTo', () => {
  it('focuses the named route', () => {
    const next = drawerRouterReducer(closedState(0), { type: 'jumpTo', name: 'Profile' });
    expect(next.index).toBe(1);
    expect(next.isOpen).toBe(false);
  });

  it('also closes an already-open drawer when jumping to a different route', () => {
    const next = drawerRouterReducer(openState(0), { type: 'jumpTo', name: 'Profile' });
    expect(next.index).toBe(1);
    expect(next.isOpen).toBe(false);
  });

  it('closes an open drawer even when jumping to the already-focused route', () => {
    // Selecting a destination is itself the dismissal gesture (the reducer's own comment) -
    // that still holds when the destination is the one already on screen.
    const state = openState(0);
    const next = drawerRouterReducer(state, { type: 'jumpTo', name: 'Home' });
    expect(next).not.toBe(state);
    expect(next).toEqual({ ...state, isOpen: false });
  });

  it('is a no-op for an unknown route name, same reference returned', () => {
    const state = closedState(0);
    expect(drawerRouterReducer(state, { type: 'jumpTo', name: 'Nowhere' })).toBe(state);
  });

  it('is a no-op when already focused on that route while closed, same reference returned', () => {
    const state = closedState(0);
    expect(drawerRouterReducer(state, { type: 'jumpTo', name: 'Home' })).toBe(state);
  });
});

describe('drawerRouterReducer — openDrawer', () => {
  it('opens a closed drawer', () => {
    expect(drawerRouterReducer(closedState(), { type: 'openDrawer' }).isOpen).toBe(true);
  });

  it('is a no-op on an already-open drawer, same reference returned', () => {
    const state = openState();
    expect(drawerRouterReducer(state, { type: 'openDrawer' })).toBe(state);
  });
});

describe('drawerRouterReducer — closeDrawer', () => {
  it('closes an open drawer', () => {
    expect(drawerRouterReducer(openState(), { type: 'closeDrawer' }).isOpen).toBe(false);
  });

  it('is a no-op on an already-closed drawer, same reference returned', () => {
    const state = closedState();
    expect(drawerRouterReducer(state, { type: 'closeDrawer' })).toBe(state);
  });
});

describe('drawerRouterReducer — toggleDrawer', () => {
  it('opens a closed drawer', () => {
    expect(drawerRouterReducer(closedState(), { type: 'toggleDrawer' }).isOpen).toBe(true);
  });

  it('closes an open drawer', () => {
    expect(drawerRouterReducer(openState(), { type: 'toggleDrawer' }).isOpen).toBe(false);
  });
});

describe('focusedDrawerRoute', () => {
  it('returns the route at the current index', () => {
    expect(focusedDrawerRoute(closedState(1))).toBe(PROFILE);
  });

  it('returns undefined when the route list is empty', () => {
    expect(focusedDrawerRoute(createInitialDrawerRouterState([]))).toBeUndefined();
  });
});
