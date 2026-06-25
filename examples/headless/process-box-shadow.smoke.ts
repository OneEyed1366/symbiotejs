// Headless proof that boxShadow/filter are JS-parsed before Fabric. RN registers these
// with enableNativeCSSParsing() (DEFAULT FALSE), so native CSS parsing is off and a raw
// string is dropped — symbiote was forwarding the raw value, so a string boxShadow
// rendered NOTHING on device. processBoxShadow/processFilter restore RN's JS parse.
//
// Two coverage paths (per the headless processColor caveat):
//  (a) ARRAY form — does not depend on color detection, so the identity processColor is fine;
//  (b) STRING form — needs a realistic processColor (null for non-colors, int for rgba),
//      because the string parser classifies each arg by `processColor(arg) != null`.

import { processBoxShadow, processFilter, setColorProcessor } from '@symbiote/shared'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

// ── (a) ARRAY form: identity processColor passes the color object through untouched ──
const arrayShadow = processBoxShadow([
  { offsetX: 0, offsetY: 0, blurRadius: 22, spreadDistance: 3, color: 'rgba(127,181,255,0.85)' },
])
assert(arrayShadow.length === 1, `array boxShadow: expected 1 shadow, got ${arrayShadow.length}`)
const a = arrayShadow[0]
assert(a.offsetX === 0, `array offsetX: expected 0, got ${String(a.offsetX)}`)
assert(a.offsetY === 0, `array offsetY: expected 0, got ${String(a.offsetY)}`)
assert(a.blurRadius === 22, `array blurRadius: expected 22, got ${String(a.blurRadius)}`)
assert(a.spreadDistance === 3, `array spreadDistance: expected 3, got ${String(a.spreadDistance)}`)
assert(a.color === 'rgba(127,181,255,0.85)', `array color: expected passthrough, got ${String(a.color)}`)

// filter array passthrough: a structured filter (already device-verified working raw) must
// survive the processor as the same primitive.
const arrayFilter = processFilter([{ brightness: 0.5 }])
assert(arrayFilter.length === 1, `array filter: expected 1, got ${arrayFilter.length}`)
const f = arrayFilter[0]
assert('brightness' in f && f.brightness === 0.5, `array filter brightness: got ${JSON.stringify(f)}`)

// ── (b) STRING form: a realistic processColor — null for lengths/keywords, int for colors ──
// The string parser walks each whitespace arg and treats one as the color iff
// processColor(arg) != null, so the stub MUST reject "0px"/"22px"/"3px" and accept rgba(...).
const PROCESSED_COLOR = 0x7fb5ffd9
setColorProcessor((value) => {
  if (typeof value === 'string' && /^(rgba?|hsla?|#)/i.test(value.trim())) return PROCESSED_COLOR
  return null
})

const stringShadow = processBoxShadow('0px 0px 22px 3px rgba(127,181,255,0.85)')
assert(stringShadow.length === 1, `string boxShadow: expected 1 shadow, got ${stringShadow.length}`)
const s = stringShadow[0]
assert(s.offsetX === 0, `string offsetX: expected 0, got ${String(s.offsetX)}`)
assert(s.offsetY === 0, `string offsetY: expected 0, got ${String(s.offsetY)}`)
assert(s.blurRadius === 22, `string blurRadius: expected 22, got ${String(s.blurRadius)}`)
assert(s.spreadDistance === 3, `string spreadDistance: expected 3, got ${String(s.spreadDistance)}`)
assert(s.color === PROCESSED_COLOR, `string color: expected processed int, got ${String(s.color)}`)

// A string filter with units exercises _getFilterAmount: 90deg hue-rotate (camelized) and a
// percentage that maps 1:1 (50% -> 0.5).
const stringFilter = processFilter('brightness(50%) hue-rotate(90deg)')
assert(stringFilter.length === 2, `string filter: expected 2, got ${stringFilter.length}`)
assert(
  'brightness' in stringFilter[0] && stringFilter[0].brightness === 0.5,
  `string filter brightness: expected 0.5, got ${JSON.stringify(stringFilter[0])}`,
)
assert(
  'hueRotate' in stringFilter[1] && stringFilter[1].hueRotate === 90,
  `string filter hueRotate: expected 90, got ${JSON.stringify(stringFilter[1])}`,
)

// An invalid primitive must zero the whole list (web semantics: paint none).
const invalid = processBoxShadow('5 0px red')
assert(invalid.length === 0, `invalid boxShadow (unitless 5) should yield [], got ${invalid.length}`)

// Reset so a later smoke in the same process sees the identity processor again.
setColorProcessor((value) => value)

console.log(`process-box-shadow: array+string boxShadow and filter parsed`)
console.log('process-box-shadow.smoke OK')
