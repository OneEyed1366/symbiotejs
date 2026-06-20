// Headless smoke for flattenStyle — no native, no React. Asserts StyleSheet.flatten
// semantics: array merge with later-wins, nested array recursion, falsy skipping,
// array/object property values passed through untouched, non-object → {}.

import { flattenStyle } from '../../packages/shared/src/style'

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

const merged = flattenStyle([{ a: 1, b: 1 }, { b: 2 }])
if (!deepEqual(merged, { a: 1, b: 2 })) {
  throw new Error(`array merge failed: ${JSON.stringify(merged)}`)
}

const nested = flattenStyle([[{ a: 1 }], [{ a: 2 }]])
if (!deepEqual(nested, { a: 2 })) {
  throw new Error(`nested arrays failed: ${JSON.stringify(nested)}`)
}

const falsy = flattenStyle([null, false, { a: 1 }, undefined])
if (!deepEqual(falsy, { a: 1 })) {
  throw new Error(`falsy skip failed: ${JSON.stringify(falsy)}`)
}

const transform = flattenStyle({ transform: [{ translateX: 5 }] })
if (!deepEqual(transform, { transform: [{ translateX: 5 }] })) {
  throw new Error(`transform value not preserved: ${JSON.stringify(transform)}`)
}

const nonObject = flattenStyle(42)
if (!deepEqual(nonObject, {})) {
  throw new Error(`non-object should flatten to {}: ${JSON.stringify(nonObject)}`)
}

console.log('style.smoke OK')
