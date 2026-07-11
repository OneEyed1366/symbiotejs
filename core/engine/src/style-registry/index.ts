// Runtime style registry. Side-effect CSS imports (compiled by the sibling CSS-to-style
// build package, not this module) call registerStyles() with camelCase keys; components
// look them up by resolveClassName(). No CSS parsing happens here — this is a
// Map<string, ...> lookup, nothing more.
//
// This registry has no Tailwind-utility detection layer — this repo's style surface has
// no Tailwind layer, so the compound lookup below always runs for 2-4-part class strings
// instead of being gated behind "no part looks like a utility class".
//
// kebab-case authoring: a CSS selector `.section-label` always registers under the
// camelCase key `sectionLabel` (@symbiote-native/css-parser's extractClassName), so a template
// can write EITHER `class="sectionLabel"` OR `class="section-label"` — resolveOne below
// falls back to the kebab->camel form on a miss. The fallback matters because assuming
// authors would always match the camelCase key exactly proved wrong in practice.

import type { IViewStyle, ITextStyle } from '../styles';

type IResolvedStyle = Partial<IViewStyle & ITextStyle>;

export type IClassNameValue =
  string | IResolvedStyle | Array<string | IResolvedStyle> | undefined | null;

// Compound lookup tries every ordering of 2-4 space-separated class parts joined by
// '.' (e.g. "btn primary" -> "btn.primary" / "primary.btn") before falling back to a
// per-class merge, mirroring CSS compound-selector registration (`.btn.primary { }`).
const COMPOUND_MIN_PARTS = 2;
const COMPOUND_MAX_PARTS = 4;

const globalStyles = new Map<string, IResolvedStyle>();

// Called by generated code from side-effect style imports. Last import wins on a
// name collision, matching CSS cascade behavior.
export function registerStyles(styles: Record<string, IResolvedStyle>): void {
  for (const [name, style] of Object.entries(styles)) {
    globalStyles.set(name, style);
  }
}

// Clears every registration; used between tests for isolation.
export function clearGlobalStyles(): void {
  globalStyles.clear();
}

// A `class`/`className` prop arrives as `unknown` at the routeProp boundary (any adapter can
// hand over anything); this narrows before resolveClassName without an `as` cast. Shared with
// adapters/vue/src/components/scroll-view/shared.ts's identical need, rather than each keeping
// its own copy — that file imports this one instead of redeclaring it.
export function isClassNameValue(value: unknown): value is IClassNameValue {
  return typeof value === 'string' || (typeof value === 'object' && value !== null);
}

export function resolveClassName(className: IClassNameValue): IResolvedStyle {
  if (!className) return {};

  if (typeof className === 'object' && !Array.isArray(className)) {
    return className;
  }

  if (Array.isArray(className)) {
    return className.reduce<IResolvedStyle>((acc, item) => {
      return { ...acc, ...resolveClassName(item) };
    }, {});
  }

  const trimmed = className.trim();
  if (!trimmed) return {};

  const exactMatch = globalStyles.get(trimmed) ?? globalStyles.get(kebabToCamel(trimmed));
  if (exactMatch) return exactMatch;

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length >= COMPOUND_MIN_PARTS && parts.length <= COMPOUND_MAX_PARTS) {
    const compound = tryCompoundLookup(parts);
    if (compound) return compound;
  }

  return parts.reduce<IResolvedStyle>((acc, cls) => {
    return { ...acc, ...resolveOne(cls) };
  }, {});
}

function generateCompoundPermutations(parts: string[]): string[] {
  if (parts.length < COMPOUND_MIN_PARTS) return [];

  const compounds: string[] = [];
  for (let size = COMPOUND_MIN_PARTS; size <= parts.length; size++) {
    compounds.push(...generateKPermutations(parts, size));
  }
  return compounds;
}

function generateKPermutations(parts: string[], size: number): string[] {
  if (size === 0) return [''];
  if (parts.length === 0) return [];

  const result: string[] = [];

  function helper(current: string[], remaining: string[], depth: number): void {
    if (depth === size) {
      result.push(toCompoundKey(current));
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      helper(
        [...current, remaining[i]],
        remaining.slice(0, i).concat(remaining.slice(i + 1)),
        depth + 1,
      );
    }
  }

  helper([], parts, 0);
  return result;
}

// Compound permutations join as camelCase ("btn primary" -> "btnPrimary") because this
// repo's CSS-to-style compiler emits plain camelCase keys for every class, single or
// compound, so "btn primary" must resolve against a registered "btnPrimary".
function toCompoundKey(parts: string[]): string {
  return parts.reduce((key, part, index) => (index === 0 ? part : key + capitalize(part)), '');
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

// Duplicated from @symbiote-native/css-parser's identical helper rather than imported: css-parser
// pulls in postcss and is build-time only (never shipped in the app bundle), and this registry
// is the opposite — pure runtime, in every app bundle — so importing it here would leak a
// build-time dependency into the shipped app. The conversion itself is two lines; keeping both
// copies in sync is a smaller cost than the alternative.
//
// Exported (not just local to this file) because ./scope.ts's Vue `<style scoped>` name
// rewriter needs the same kebab->camel normalization and is a different responsibility living
// in a sibling module — see that file's own doc comment for why it's split out of this one.
export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function tryCompoundLookup(parts: string[]): IResolvedStyle | null {
  if (parts.length < COMPOUND_MIN_PARTS) return null;

  for (const compound of generateCompoundPermutations(parts)) {
    const style = globalStyles.get(compound);
    if (style) return style;
  }

  return null;
}

function resolveOne(name: string): IResolvedStyle {
  const trimmed = name.trim();
  if (!trimmed) return {};
  return globalStyles.get(trimmed) ?? globalStyles.get(kebabToCamel(trimmed)) ?? {};
}
