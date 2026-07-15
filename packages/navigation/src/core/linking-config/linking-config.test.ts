// Co-located unit test (ADR 0025) for the pure linking-config resolver: URL->route and
// route->URL, over a flat route and a ':param' route, plus the nested-config flattening and the
// prefix-vs-bare-path forms called out in the task ('myapp://user/42' and '/user/42').

import { describe, expect, it } from 'vitest';
import { resolveRouteFromUrl, resolveUrlFromRoute } from './index';
import type { ILinkingConfig } from './index';
import type { IRoute } from '../navigator-state';

const CONFIG: ILinkingConfig = {
  prefixes: ['myapp://', 'https://example.com'],
  config: {
    screens: {
      Home: '',
      User: 'user/:id',
      Settings: {
        path: 'settings',
        screens: {
          Profile: 'profile',
        },
      },
    },
  },
};

describe('resolveRouteFromUrl', () => {
  it('resolves a flat route with no params, scheme prefix', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://')).toEqual({
      key: 'Home',
      name: 'Home',
      params: undefined,
    });
  });

  it('resolves a :param route through a scheme prefix', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://user/42')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '42' },
    });
  });

  it('resolves the same :param route through a bare path (no configured prefix match)', () => {
    expect(resolveRouteFromUrl(CONFIG, '/user/42')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '42' },
    });
  });

  it('resolves a :param route through an https prefix', () => {
    expect(resolveRouteFromUrl(CONFIG, 'https://example.com/user/7')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '7' },
    });
  });

  it('resolves a nested screen to its leaf name, path accumulated from the group', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://settings/profile')).toEqual({
      key: 'Profile',
      name: 'Profile',
      params: undefined,
    });
  });

  it('decodes a percent-encoded param segment', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://user/john%20doe')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: 'john doe' },
    });
  });

  it('returns null for a url matching no configured screen', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://nowhere')).toBeNull();
  });

  it('returns null for a url matching no configured prefix and no leading slash', () => {
    expect(resolveRouteFromUrl(CONFIG, 'otherapp://user/42')).toBeNull();
  });
});

describe('resolveUrlFromRoute', () => {
  it('builds a url for a flat route with no params', () => {
    const route: IRoute<unknown> = { key: 'k', name: 'Home', params: undefined };
    expect(resolveUrlFromRoute(CONFIG, route)).toBe('myapp://');
  });

  it('builds a url for a :param route', () => {
    const route: IRoute<unknown> = { key: 'k', name: 'User', params: { id: '42' } };
    expect(resolveUrlFromRoute(CONFIG, route)).toBe('myapp://user/42');
  });

  it('builds a url for a nested screen using its accumulated path', () => {
    const route: IRoute<unknown> = { key: 'k', name: 'Profile', params: undefined };
    expect(resolveUrlFromRoute(CONFIG, route)).toBe('myapp://settings/profile');
  });

  it('returns null when a required param is missing', () => {
    const route: IRoute<unknown> = { key: 'k', name: 'User', params: {} };
    expect(resolveUrlFromRoute(CONFIG, route)).toBeNull();
  });

  it('returns null for an unconfigured route name', () => {
    const route: IRoute<unknown> = { key: 'k', name: 'Nowhere', params: undefined };
    expect(resolveUrlFromRoute(CONFIG, route)).toBeNull();
  });
});
