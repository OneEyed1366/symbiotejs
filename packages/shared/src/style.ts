// StyleSheet.flatten, ported. RN's idiom is `style={[base, override, cond && extra]}`
// — an array of objects (and nested arrays) where later keys win. But Fabric's C++
// reads a single flat props payload, so before we diff and commit we must collapse
// that array into one plain object. This is the only place that collapse happens.
//
// Mirrors react-native/Libraries/StyleSheet/flattenStyle.js: recurse on the style
// POSITION only, never on a property VALUE. `transform: [{translateX: 5}]` is an
// array-valued prop and `shadowOffset: {width, height}` an object-valued prop — both
// are copied through untouched. Only the top-level style slot is flattened.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    const result: Record<string, unknown> = {}
    for (const entry of style) {
      // Falsy entries (null/undefined/false/''/0) flatten to {} and contribute nothing.
      const flat = flattenStyle(entry)
      for (const key in flat) {
        result[key] = flat[key]
      }
    }
    return result
  }

  if (isPlainObject(style)) {
    // Shallow copy of own enumerable keys: values (arrays, nested objects) pass through.
    return { ...style }
  }

  return {}
}
