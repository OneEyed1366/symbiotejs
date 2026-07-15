// A light, independent scan for `:global(...)`-wrapped selectors inside a scoped CSS block's
// raw text. parseCSS's extractClassName already UNWRAPS :global(...) (so `:global(.reset)`
// parses to the same `reset` key a plain `.reset` selector would), but its output has no marker
// for "this key came from inside :global()" — parseCSS's return shape is deliberately just
// `{ className: style }`, no per-key metadata. A caller doing its own scope-suffixing (Vue's
// <style scoped>/<style module>, or a standalone .module.css file) needs that distinction to
// exempt these names, so it re-derives it here with its own minimal regex, independent of the
// full CSS-to-style pipeline. Only the single-class form (`:global(.name)`) is recognized,
// matching extractClassName's own documented narrower gap for partial/nested :global() wrapping.
import { kebabToCamel } from './parser/index.ts';

const GLOBAL_SELECTOR_PATTERN = /:global\(\s*\.([a-zA-Z0-9_-]+)\s*\)/g;

export function globalClassNamesIn(css: string): Set<string> {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = GLOBAL_SELECTOR_PATTERN.exec(css)) !== null) {
    // Normalize kebab->camel: parseCSS's output is always camelCase-keyed, but the regex above
    // captures the CSS text verbatim — a kebab selector like `:global(.reset-btn)` would
    // otherwise never match its own `resetBtn` key.
    names.add(kebabToCamel(match[1]));
  }
  return names;
}
