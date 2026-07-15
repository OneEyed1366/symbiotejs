// Linking config: the piece @react-navigation's `NavigationContainer`'s `linking` prop provides
// on top of the framework-agnostic `Linking` module (core/engine/src/linking) - resolving a URL
// ('myapp://user/42', '/user/42') to a route, and a route back to a URL. This is OUR OWN type,
// not imported from react-navigation, kept close to its shape (`prefixes` + `config.screens`)
// only so the DX is familiar.
//
// Why hand-rolled matching instead of react-router's `matchPath`/`generatePath` (evaluated per
// task): react-router 8's package has no subpath export for the pure `lib/router/utils.ts`
// matcher - its only general entry point (`.`) eagerly imports `./lib/dom/*`
// (BrowserRouter/ScrollRestoration/cookies) and `./lib/server-runtime/*`, code that assumes DOM
// and Node globals a Metro/Hermes RN bundle doesn't have; its `peerDependencies` also pin
// `react-dom`, which this DOM-free monorepo never installs (see CLAUDE.md
// react_native_is_an_explicit_top_level_peer - no foreign runtime singleton gets smuggled in).
// On top of the bundling risk, `matchPath`'s/`generatePath`'s param-name extraction is a
// template-literal-type trick that only fires for a compile-time LITERAL path string; our
// patterns come from a runtime config object (`Path` widens to plain `string`), so the generic
// degrades to an empty params type and using the result would force an `as` cast - forbidden by
// this project's TS conventions. A minimal `:param`-segment matcher sidesteps both problems and
// is the right size for a single flat Stack (no optional/splat segments - no nested-navigator use
// for them yet).

import { dlog } from '@symbiote-native/engine';
import type { IRoute } from '../navigator-state';
import { isRecord } from '../guards';

export type IScreenLinkingConfig =
  | string
  | {
      path?: string;
      screens?: Record<string, IScreenLinkingConfig>;
    };

export type ILinkingConfig = {
  prefixes: string[];
  config: {
    screens: Record<string, IScreenLinkingConfig>;
  };
};

type IFlatRoutePattern = {
  name: string;
  pattern: string;
};

// Strips leading/trailing slashes so segments join predictably regardless of how the caller
// wrote a path ('feed/:sort', '/feed/:sort/', etc).
function normalizeSegment(segment: string): string {
  return segment.replace(/^\/+|\/+$/g, '');
}

function joinPath(parent: string, child: string): string {
  const parts = [normalizeSegment(parent), normalizeSegment(child)].filter(part => part.length > 0);
  return parts.join('/');
}

// Walks `screens` recursively, accumulating the path down to each LEAF screen. Unlike
// react-navigation (which resolves nested config into nested navigation state), our navigator is
// a single flat Stack - a `screens` group with no `path` of its own is transparent (consumes no
// URL segment); a group WITH a `path` but no nested `screens` is itself a leaf using that path.
function flattenScreens(
  screens: Record<string, IScreenLinkingConfig>,
  parentPath: string,
  out: IFlatRoutePattern[],
): IFlatRoutePattern[] {
  for (const [name, entry] of Object.entries(screens)) {
    if (typeof entry === 'string') {
      out.push({ name, pattern: joinPath(parentPath, entry) });
      continue;
    }

    const nextParent = entry.path !== undefined ? joinPath(parentPath, entry.path) : parentPath;

    if (entry.screens !== undefined) {
      flattenScreens(entry.screens, nextParent, out);
    } else if (entry.path !== undefined) {
      out.push({ name, pattern: nextParent });
    } else {
      dlog(`linking-config: screen "${name}" has neither a path nor nested screens, skipping`);
    }
  }
  return out;
}

function dynamicSegmentCount(pattern: string): number {
  if (pattern.length === 0) return 0;
  return pattern.split('/').filter(segment => segment.startsWith(':')).length;
}

function segmentCount(pattern: string): number {
  return pattern.length === 0 ? 0 : pattern.split('/').length;
}

// More static segments should win over a param that would also match (e.g. a literal
// '/user/me' pattern over '/user/:id'), mirroring how react-navigation prefers exact matches.
function bySpecificity(a: IFlatRoutePattern, b: IFlatRoutePattern): number {
  const dynamicDiff = dynamicSegmentCount(a.pattern) - dynamicSegmentCount(b.pattern);
  if (dynamicDiff !== 0) return dynamicDiff;
  return segmentCount(b.pattern) - segmentCount(a.pattern);
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = pattern.length === 0 ? [] : pattern.split('/');
  const pathSegments = pathname.length === 0 ? [] : pathname.split('/');
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];
    if (patternSegment.startsWith(':')) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return params;
}

function stripQueryAndHash(url: string): string {
  const match = /[?#]/.exec(url);
  return match === null ? url : url.slice(0, match.index);
}

// Resolves a full URL down to the bare path segment string ('user/42', no leading slash) by
// stripping the longest matching configured prefix, falling back to treating the URL as an
// already-bare path when it starts with '/' (the task's second example form). Returns null when
// neither applies - an unrecognized scheme/host, not "no route matched".
function extractPathname(config: ILinkingConfig, url: string): string | null {
  const withoutQuery = stripQueryAndHash(url);
  const sortedPrefixes = [...config.prefixes].sort((a, b) => b.length - a.length);
  for (const prefix of sortedPrefixes) {
    if (withoutQuery.startsWith(prefix)) {
      return normalizeSegment(withoutQuery.slice(prefix.length));
    }
  }
  if (withoutQuery.startsWith('/')) return normalizeSegment(withoutQuery);
  return null;
}

export function resolveRouteFromUrl(config: ILinkingConfig, url: string): IRoute<unknown> | null {
  const pathname = extractPathname(config, url);
  if (pathname === null) {
    dlog(`linking-config: url "${url}" matched no configured prefix`);
    return null;
  }

  const candidates = flattenScreens(config.config.screens, '', []).sort(bySpecificity);
  for (const candidate of candidates) {
    const params = matchPattern(candidate.pattern, pathname);
    if (params !== null) {
      dlog(`linking-config: resolved "${url}" -> ${candidate.name}`);
      // `key` is not real route identity here - the navigator mints its own on push/replace
      // (stack.ts's createRoute); `name` is a stable enough placeholder to satisfy IRoute's shape.
      return {
        key: candidate.name,
        name: candidate.name,
        params: Object.keys(params).length > 0 ? params : undefined,
      };
    }
  }

  dlog(`linking-config: url "${url}" (path "${pathname}") matched no configured screen`);
  return null;
}

// The inverse of matchPattern: fills a pattern's ':param' segments from `params`, or returns
// null when a required param is missing (mirrors react-router's generatePath throwing, minus the
// throw - a resolver returning null reads more naturally at the call site here).
function fillPattern(pattern: string, params: unknown): string | null {
  if (pattern.length === 0) return '';
  const source = isRecord(params) ? params : {};
  const segments: string[] = [];
  for (const segment of pattern.split('/')) {
    if (!segment.startsWith(':')) {
      segments.push(segment);
      continue;
    }
    const value = source[segment.slice(1)];
    if (value === undefined || value === null) return null;
    segments.push(encodeURIComponent(String(value)));
  }
  return segments.join('/');
}

export function resolveUrlFromRoute(config: ILinkingConfig, route: IRoute<unknown>): string | null {
  const candidate = flattenScreens(config.config.screens, '', []).find(
    entry => entry.name === route.name,
  );
  if (candidate === undefined) {
    dlog(`linking-config: no configured screen for route name "${route.name}"`);
    return null;
  }

  const path = fillPattern(candidate.pattern, route.params);
  if (path === null) {
    dlog(
      `linking-config: route "${route.name}" is missing a param required by "${candidate.pattern}"`,
    );
    return null;
  }

  const prefix = config.prefixes[0];
  if (prefix === undefined) return path.length > 0 ? `/${path}` : '/';

  // A prefix already carrying its own trailing separator ('myapp://') must not be truncated to
  // 'myapp:/' by naively slicing one char off - only add a '/' when the prefix doesn't have one.
  if (path.length === 0) return prefix;
  return prefix.endsWith('/') ? `${prefix}${path}` : `${prefix}/${path}`;
}
