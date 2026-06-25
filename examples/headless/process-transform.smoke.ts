// Headless proof that a STRING transform is JS-parsed before Fabric and an ARRAY transform
// passes through UNCHANGED. RN registers `transform` via `nativeCSSParsing ? true :
// {process: processTransform}` and enableNativeCSSParsing() DEFAULTS TO FALSE, so RN's stock
// path parses the CSS string in JS; a raw string reached Android native, which cast it to
// ReadableArray and crashed (`java.lang.String cannot be cast to ...ReadableArray`).
//
// The array branch is the animated / sticky-header hot path — it MUST return the input
// unchanged (no decompose, no clone) or animated transforms regress. Expected string outputs
// are RN-exact (cross-checked against RN's processTransform / its parse rules).

import { processTransform } from '@symbiote/shared'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

// deepEqual over the entry-array shape: arrays of single-key records whose values are
// scalars or numeric arrays.
function deepEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a != null && b != null && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    return ak.every((k) => deepEqual(Reflect.get(a, k), Reflect.get(b, k)))
  }
  return a === b
}

// ── ARRAY input: no-regression. The hot path returns the array unchanged. ──
const rotArr = [{ rotate: '6deg' }]
const rotOut = processTransform(rotArr)
assert(deepEqual(rotOut, [{ rotate: '6deg' }]), `array [{rotate:'6deg'}] passthrough: got ${JSON.stringify(rotOut)}`)

const transYArr = [{ translateY: 12 }]
const transYOut = processTransform(transYArr)
assert(deepEqual(transYOut, [{ translateY: 12 }]), `array [{translateY:12}] passthrough: got ${JSON.stringify(transYOut)}`)

const multiArr = [{ translateX: '50%' }, { scale: 1.2 }]
const multiOut = processTransform(multiArr)
assert(deepEqual(multiOut, [{ translateX: '50%' }, { scale: 1.2 }]), `array multi passthrough: got ${JSON.stringify(multiOut)}`)

// Identical reference-shape: the array branch returns the SAME reference (no clone), so the
// commit flush can diff it as unchanged.
assert(rotOut === rotArr, 'array input must return the same reference (no clone)')

// ── STRING input: RN-exact CSS parse into the entry array. ──
const rotStr = processTransform('rotate(6deg)')
assert(deepEqual(rotStr, [{ rotate: '6deg' }]), `'rotate(6deg)': expected [{rotate:'6deg'}], got ${JSON.stringify(rotStr)}`)

const transXStr = processTransform('translateX(10px)')
assert(deepEqual(transXStr, [{ translateX: 10 }]), `'translateX(10px)': expected [{translateX:10}], got ${JSON.stringify(transXStr)}`)

const scaleStr = processTransform('scale(1.5)')
assert(deepEqual(scaleStr, [{ scale: 1.5 }]), `'scale(1.5)': expected [{scale:1.5}], got ${JSON.stringify(scaleStr)}`)

// RN normalizes `translate(x, y)` to the `translate` key with a [x, y] numeric array.
const translateStr = processTransform('translate(10px, 20px)')
assert(
  deepEqual(translateStr, [{ translate: [10, 20] }]),
  `'translate(10px, 20px)': expected [{translate:[10,20]}], got ${JSON.stringify(translateStr)}`,
)

// A single-axis translate gets an implicit y of 0 (RN processTransform.js:109-111).
const translateOne = processTransform('translate(1px)')
assert(
  deepEqual(translateOne, [{ translate: [1, 0] }]),
  `'translate(1px)': expected [{translate:[1,0]}], got ${JSON.stringify(translateOne)}`,
)

// A percentage translate axis stays a string.
const transXPct = processTransform('translateX(10%)')
assert(deepEqual(transXPct, [{ translateX: 10 }]), `'translateX(10%)': got ${JSON.stringify(transXPct)}`)

// Empty string yields an empty array; null/undefined yields [].
assert(deepEqual(processTransform(''), []), `empty string: got ${JSON.stringify(processTransform(''))}`)
assert(deepEqual(processTransform(undefined), []), `undefined: got ${JSON.stringify(processTransform(undefined))}`)

console.log('process-transform: string parsed RN-exact, array passes through unchanged')
console.log('process-transform.smoke OK')
