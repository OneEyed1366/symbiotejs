// JS-side port of RN's processFontVariant (Libraries/StyleSheet/processFontVariant.js).
// Same root cause family as boxShadow/filter: RN registers `fontVariant` with a JS
// `process` because enableNativeCSSParsing() defaults to false, so a space-separated CSS
// string ('small-caps tabular-nums') is split into the array native expects IN JS. An
// array — the common, already-working form — passes through untouched; this is a no-op
// for it.

// RN processFontVariant.js:15-28. Array → array; space-separated string → array of variants.
export function processFontVariant(
  fontVariant: ReadonlyArray<string> | string,
): ReadonlyArray<string> {
  if (Array.isArray(fontVariant)) {
    return fontVariant
  }

  if (typeof fontVariant === 'string') {
    return fontVariant.split(' ').filter(Boolean)
  }

  // Neither an array nor a string: nothing to split, hand back an empty variant list.
  return []
}
