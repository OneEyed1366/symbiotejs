// Vue does NOT camelCase $attrs: a template `:content-container-style` arrives in attrs keyed
// 'content-container-style', but symbiote's prop contract is RN-camelCase (contentContainerStyle)
// and idiomatic Vue templates use kebab-case. Reading `attrs.contentContainerStyle` then misses,
// so a consumed prop is silently dropped (lost padding) and a non-consumed one leaks to Fabric
// (Android `JS Functions are not convertible to dynamic` when a VNode-valued prop forwards). So
// every adapter component normalizes its incoming attrs kebab→camel at entry.
//
// Two prefixes MUST stay kebab: `aria-*` (resolveAccessibilityProps reads 'aria-label' literally)
// and `data-*`. Event keys are already `onXxx` (Vue folds `@value-change` → onValueChange, no
// dash) so they pass through untouched.

const KEBAB_SEGMENT = /-([a-z])/g;

function toCamel(key: string): string {
  return key.replace(KEBAB_SEGMENT, (_match, char: string) => char.toUpperCase());
}

export function normalizeVueAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (key.includes('-') && !key.startsWith('aria-') && !key.startsWith('data-')) {
      out[toCamel(key)] = attrs[key];
      changed = true;
    } else {
      out[key] = attrs[key];
    }
  }
  // Return the original object when nothing converted (the already-camel / TSX path): avoids a
  // per-render allocation and keeps attrs identity stable.
  return changed ? out : attrs;
}
