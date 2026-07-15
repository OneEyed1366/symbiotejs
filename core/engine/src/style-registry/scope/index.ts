// Vue `<style scoped>` class-name rewriter. Distinct responsibility from the sibling
// ./index.ts (the CSS class -> style registry): this module does pure NAME rewriting,
// no registry lookup, no CSS parsing. It runs at the compiled call site of a Vue SFC's
// scoped-style template - `adapters/vue/metro-vue-transformer.cjs` emits calls to
// scopeClassName (imported there as `__scopeClass`) - BEFORE Vue's own normalizeClass()
// collapses string/object/array `class` values to a final string, so it must pre-process
// all three shapes normalizeClass understands. resolveClassName in ./index.ts still does
// the actual style lookup, unchanged, against the rewritten (possibly suffixed) name.

import { kebabToCamel } from '../index';

export type IClassToggleMap = Record<string, boolean | undefined>;

export type IScopableClassValue =
  string | IClassToggleMap | Array<string | IClassToggleMap> | undefined | null;

// Suffixes every class token that this file's scoped block locally defines with
// `__${scopeId}`, leaving unrecognized tokens (globals, external classes) untouched.
export function scopeClassName(
  value: IScopableClassValue,
  localNames: ReadonlySet<string>,
  scopeId: string,
): IScopableClassValue {
  if (value === undefined || value === null) return value;

  if (Array.isArray(value)) {
    return value.map(item => scopeClassEntry(item, localNames, scopeId));
  }

  return scopeClassEntry(value, localNames, scopeId);
}

// A token arrives as either the camelCase registry key (`sectionLabel`) or its kebab-case
// authoring form (`section-label`) - normalize to camelCase FIRST, then decide scoping, so
// `localNames` (always camelCase, built from the css-parser's registered keys) recognizes a
// kebab-written token. The emitted (possibly suffixed) name is always the camelCase form.
function scopeToken(token: string, localNames: ReadonlySet<string>, scopeId: string): string {
  const camelToken = kebabToCamel(token);
  return localNames.has(camelToken) ? `${camelToken}__${scopeId}` : camelToken;
}

function scopeClassEntry(
  value: string | IClassToggleMap,
  localNames: ReadonlySet<string>,
  scopeId: string,
): string | IClassToggleMap {
  if (typeof value === 'object') {
    const scoped: IClassToggleMap = {};
    for (const [name, enabled] of Object.entries(value)) {
      scoped[scopeToken(name, localNames, scopeId)] = enabled;
    }
    return scoped;
  }

  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(token => scopeToken(token, localNames, scopeId))
    .join(' ');
}
