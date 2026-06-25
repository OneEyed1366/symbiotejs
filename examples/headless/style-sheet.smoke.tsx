// Headless proof of the StyleSheet API. No simulator: we exercise create/flatten/
// compose/absoluteFill against plain objects, and for hairlineWidth we install a
// fake __turboModuleProxy so getNativeModule('DeviceInfo') returns a known screen
// scale — then assert the width matches RN's formula for that scale. A failure here
// is in JS, not native.

import { StyleSheet, computeHairlineWidth } from '../../core/engine/src/style-sheet'

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`)
}

// ---- create: identity, input entries preserved ---------------------------
const input = { box: { flex: 1, padding: 8 }, title: { color: 'red' } }
const created = StyleSheet.create(input)
assertEqual(created, input, 'create deep-equals input')
if (created.box.flex !== 1) throw new Error('create lost a key value')

// ---- flatten: later keys win (reuses shared flattenStyle) -----------------
assertEqual(StyleSheet.flatten([{ a: 1 }, { a: 2, b: 3 }]), { a: 2, b: 3 }, 'flatten merges')

// ---- absoluteFill: four zeroed insets + absolute --------------------------
assertEqual(
  StyleSheet.absoluteFill,
  { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  'absoluteFill shape',
)
if (StyleSheet.absoluteFill !== StyleSheet.absoluteFillObject) {
  throw new Error('absoluteFill and absoluteFillObject must be the same object')
}

// ---- compose: RN semantics ------------------------------------------------
const x = { a: 1 }
const y = { b: 2 }
assertEqual(StyleSheet.compose(x, y), [x, y], 'compose both -> pair')
if (StyleSheet.compose(x, undefined) !== x) throw new Error('compose(x, undefined) must be x')
if (StyleSheet.compose(undefined, y) !== y) throw new Error('compose(undefined, y) must be y')
if (StyleSheet.compose(null, null) !== null) throw new Error('compose(null, null) must be null')

// ---- hairlineWidth: fake DeviceInfo so scale is known ---------------------
const FAKE_SCALE = 3
globalThis.__turboModuleProxy = <T,>(name: string): T | null => {
  if (name !== 'DeviceInfo') return null
  const deviceInfo = {
    getConstants: () => ({ Dimensions: { window: { scale: FAKE_SCALE } } }),
  }
  if (typeof deviceInfo !== 'object') return null
  return deviceInfo as T
}

const width = StyleSheet.hairlineWidth
if (typeof width !== 'number' || !(width > 0)) {
  throw new Error(`hairlineWidth must be a positive number, got ${String(width)}`)
}
assertEqual(width, computeHairlineWidth(FAKE_SCALE), 'hairlineWidth matches formula for scale')

console.log('style-sheet.smoke OK')
