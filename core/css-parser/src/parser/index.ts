// CSS → React Native style-object compiler. `extractClassName` and the CSS-custom-property/
// `var()` resolution machinery are framework/target-agnostic. `evaluateCalc` treats `px` as
// identity (RN has no cell grid to scale against) and `rem`/`em` as scaled by the same
// {@link REM_TO_PX} constant as a bare value (see values.ts). `mapCSSProperty` (properties.ts)
// targets RN's `ViewStyle`/`TextStyle`.

import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { mapCSSProperty } from '../properties.ts';
import { REM_TO_PX } from '../values.ts';

export type ICssParserOptions = {
  filename?: string;
};

//#region Selector utilities

// Exported: the SFC style compiler (metro-vue-transformer.js) reuses this exact conversion to
// normalize a template's kebab-case class="section-label" authoring to the camelCase key this
// module already registers CSS selectors under, so both spellings resolve to the same style.
export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function unescapeIdentifier(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

/**
 * Extract a camelCase class name from a CSS selector, or `null` if the selector has no RN
 * equivalent (pseudo-classes/-elements, bare element selectors, the universal selector — RN has
 * no element-selector concept, so those would just pollute the output).
 *
 * - `.card` → `'card'`
 * - `#header` → `'header'`
 * - `.btn.primary` → `'btnPrimary'` (compound)
 * - `.card .title` / `.card > .title` → `'cardTitle'` (descendant/child, flattened)
 * - `[data-theme]` → `'dataTheme'` (attribute)
 * - `.my-class-name` → `'myClassName'` (kebab → camel)
 */
export function extractClassName(selector: string): string | null {
  const trimmed = selector.trim();

  if (/^[a-z]+$/i.test(trimmed)) return null;
  if (trimmed === '*') return null;

  // `:global(...)` (Vue `<style scoped>` escape hatch) opts a selector out of scope-suffixing —
  // a caller concern outside this package. Here it just needs unwrapping: when the WHOLE trimmed
  // selector is one `:global(...)` wrapper, recurse on its inner text and return whatever that
  // resolves to, reusing every selector shape below instead of duplicating it. Checked before the
  // "starts with :" / "any colon anywhere" guards, since `:global(...)` legitimately contains a
  // colon that must not trigger them. Known gap: a `:global(...)` wrapping only PART of a larger
  // compound/descendant selector (e.g. `.card :global(.reset)`) is NOT unwrapped by this check.
  const globalMatch = trimmed.match(/^:global\(\s*(.+?)\s*\)$/);
  if (globalMatch?.[1]) return extractClassName(globalMatch[1]);

  if (trimmed.startsWith(':')) return null;

  // A pseudo-class/-element trailing a class/id selector (`.card:hover`, `.card::before`) has
  // no RN equivalent — RN has no hover/focus/nth-child style variants — so the WHOLE rule is
  // dropped, same as a bare `:hover`. Stripping just the pseudo suffix and keeping `.card`'s
  // other declarations would be wrong: it'd silently merge hover-only styles into the
  // always-applied base style (a real gap an earlier version of this fix had — found by
  // manually running the parser on `.card:hover { opacity: 0.5 }` and seeing `opacity` leak
  // into `card`'s permanent style). `[...]` is excluded first since an attribute selector's
  // value may legitimately contain a colon (`[data-x="a:b"]`).
  if (trimmed.replace(/\[[^\]]*\]/g, '').includes(':')) return null;

  // Compound selector (`.btn.primary`, `div.card`) — split on unescaped dots.
  if (trimmed.includes('.') && !trimmed.includes(' ') && !trimmed.includes('>')) {
    const parts = trimmed.split(/(?<!\\)\./).filter(Boolean);
    if (parts.length > 0) {
      const startsWithElement = !trimmed.startsWith('.');
      const startIndex = startsWithElement ? 1 : 0;
      if (startIndex >= parts.length) return null;

      return parts
        .slice(startIndex)
        .map((part, i) => {
          const camelPart = kebabToCamel(unescapeIdentifier(part));
          return i === 0 ? camelPart : capitalize(camelPart);
        })
        .join('');
    }
  }

  // Descendant/child selector (`.card .title`, `.card > .title`) — flattened into one name.
  if (trimmed.includes(' ')) {
    const parts = trimmed.split(/\s+(?:>\s*)?/).filter(Boolean);
    const classNames: string[] = [];

    for (const part of parts) {
      const classMatch = part.match(/\.((?:[a-zA-Z0-9_-]|\\.)+)/);
      if (classMatch?.[1]) {
        classNames.push(unescapeIdentifier(classMatch[1]));
        continue;
      }
      const idMatch = part.match(/#((?:[a-zA-Z0-9_-]|\\.)+)/);
      if (idMatch?.[1]) classNames.push(unescapeIdentifier(idMatch[1]));
    }

    if (classNames.length === 0) return null;
    return classNames
      .map((name, i) => {
        const camelName = kebabToCamel(name);
        return i === 0 ? camelName : capitalize(camelName);
      })
      .join('');
  }

  // Single class selector (`.card`).
  const classMatch = trimmed.match(/^\.((?:[a-zA-Z0-9_-]|\\.)+)/);
  if (classMatch?.[1]) return kebabToCamel(unescapeIdentifier(classMatch[1]));

  // ID selector (`#header`).
  const idMatch = trimmed.match(/^#((?:[a-zA-Z0-9_-]|\\.)+)/);
  if (idMatch?.[1]) return kebabToCamel(unescapeIdentifier(idMatch[1]));

  // Attribute selector (`[data-theme]`).
  const attrMatch = trimmed.match(/^\[([a-zA-Z0-9_-]+)(?:=[^\]]+)?\]/);
  if (attrMatch?.[1]) return kebabToCamel(attrMatch[1]);

  return null;
}

//#endregion Selector utilities

//#region var() resolution

function resolveVariables(value: string, variables: Map<string, string>): string {
  if (!value.includes('var(')) return value;

  const parsed = valueParser(value);
  parsed.walk((node, index, nodes) => {
    if (node.type !== 'function' || node.value !== 'var' || node.nodes.length === 0) return;

    const varName = node.nodes[0]?.value;
    if (!varName) return;
    const fallbackNode = node.nodes.length > 2 ? node.nodes[2] : undefined;
    const resolved = variables.get(varName) ?? fallbackNode?.value ?? '';
    if (!resolved) return;

    // Replace the `var(...)` function node in its containing array with a plain word node
    // holding the resolved text, instead of mutating `node`'s discriminated `type` in place.
    nodes[index] = {
      type: 'word',
      value: resolveVariables(resolved, variables),
      sourceIndex: node.sourceIndex,
      sourceEndIndex: node.sourceEndIndex,
    };
  });

  return parsed.toString();
}

//#endregion var() resolution

//#region calc() evaluation

const CALC_TERM_PATTERN = /calc\(([^)]+)\)/g;
const NUMBER_WITH_UNIT_PATTERN = /(-?\d+(?:\.\d+)?)(rem|em|px)?/g;

/**
 * Evaluates a narrow shape of `calc()`: a single multiplication, or the first numeric term
 * as a fallback. `px` is identity; `rem`/`em` scale by {@link REM_TO_PX}, matching a bare
 * dimension value.
 */
function evaluateCalc(value: string): string {
  if (!value.includes('calc(')) return value;

  return value.replace(CALC_TERM_PATTERN, (_, expr: string) => {
    const matches = expr.match(NUMBER_WITH_UNIT_PATTERN) ?? [];
    const values: number[] = [];

    for (const term of matches) {
      const numMatch = term.match(/(-?\d+(?:\.\d+)?)(rem|em|px)?/);
      if (!numMatch) continue;
      const amount = parseFloat(numMatch[1]!);
      const unit = numMatch[2];
      values.push(unit === 'rem' || unit === 'em' ? amount * REM_TO_PX : amount);
    }

    if (expr.includes('*')) {
      const parts = expr.split('*').map(part => part.trim());
      if (parts.length === 2) {
        const a = values[0] ?? parseFloat(parts[0]!) ?? 0;
        const b = parseFloat(parts[1]!) || 1;
        return String(Math.round(a * b));
      }
    }

    return String(Math.round(values[0] ?? 0));
  });
}

//#endregion calc() evaluation

/**
 * Parse a plain CSS string into a `{ className: RNStyleObject }` map. Build-time only — never
 * ship this in the app's native JS bundle; it is meant to run inside a Metro transformer.
 */
export function parseCSS(
  css: string,
  options?: ICssParserOptions,
): Record<string, Record<string, unknown>> {
  if (!css || typeof css !== 'string') return {};

  const root = postcss.parse(css, { from: options?.filename });
  const styles: Record<string, Record<string, unknown>> = {};
  const warnedProperties = new Set<string>();

  // `@media` (and any other at-rule) is unsupported; drop it before the rule walk below so its
  // nested rules never leak into the output.
  root.walkAtRules(atRule => {
    console.warn(
      `[@symbiote-native/css-parser] "@${atRule.name}" at-rules are not supported, "@${atRule.name} ${atRule.params}" skipped`,
    );
    atRule.remove();
  });

  const variables = new Map<string, string>();
  root.walkDecls(decl => {
    if (decl.prop.startsWith('--')) variables.set(decl.prop, decl.value);
  });

  root.walkRules(rule => {
    const selectors = rule.selector.split(',').map(selector => selector.trim());

    for (const selector of selectors) {
      const className = extractClassName(selector);
      if (!className) continue;

      const style: Record<string, unknown> = {};
      rule.walkDecls(decl => {
        if (decl.prop.startsWith('--')) return;

        const resolvedValue = evaluateCalc(resolveVariables(decl.value, variables));
        const mapped = mapCSSProperty(decl.prop.toLowerCase(), resolvedValue, warnedProperties);
        if (mapped) Object.assign(style, mapped);
      });

      if (Object.keys(style).length === 0) continue;
      styles[className] = { ...styles[className], ...style };
    }
  });

  return styles;
}
