// JS-side port of RN's processAspectRatio (Libraries/StyleSheet/processAspectRatio.js).
// Same root cause family as boxShadow/filter: RN registers `aspectRatio` with a JS
// `process` because enableNativeCSSParsing() defaults to false, so the CSS ratio string
// ('16 / 9') is resolved to a number IN JS before native. A plain number — the common,
// already-working form — passes through untouched; this is a no-op for it.
//
// RN throws via invariant() in __DEV__ on a malformed value; we dlog and return undefined.

import { dlog } from './debug'

// RN processAspectRatio.js:15-63. number → number; ratio string → number; invalid → undefined.
export function processAspectRatio(
  aspectRatio: number | string | undefined,
): number | undefined {
  if (typeof aspectRatio === 'number') {
    return aspectRatio
  }
  if (typeof aspectRatio !== 'string') {
    if (aspectRatio != null) {
      dlog(`processAspectRatio reject: must be a number, ratio string or "auto"`)
    }
    return undefined
  }

  const matches = aspectRatio.split('/').map((s) => s.trim())

  // RN processAspectRatio.js:34-43 — `auto` (and `auto <ratio>`) is not a numeric ratio.
  if (matches.includes('auto')) {
    return undefined
  }

  const hasNonNumericValues = matches.some((n) => Number.isNaN(Number(n)))
  if (hasNonNumericValues || (matches.length !== 1 && matches.length !== 2)) {
    dlog(`processAspectRatio reject: invalid ratio string "${aspectRatio}"`)
    return undefined
  }

  if (matches.length === 2) {
    return Number(matches[0]) / Number(matches[1])
  }

  return Number(matches[0])
}
