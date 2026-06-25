// Headless proof that transformOrigin/aspectRatio/fontVariant are JS-parsed before Fabric.
// RN registers these via `nativeCSSParsing ? true : {process: ...}` and enableNativeCSSParsing()
// DEFAULTS TO FALSE, so RN's stock path runs the processor IN JS. symbiote forwarded the raw
// value: a `transformOrigin: 'top left'` string reached Android native, which cast it to
// ReadableArray and crashed (`java.lang.String cannot be cast to ...ReadableArray`). These
// processors restore RN's JS parse so native always receives the array/number it expects.
//
// Expected outputs are RN-exact (cross-checked against RN's own processTransformOrigin tests).

import { processTransformOrigin, processAspectRatio, processFontVariant } from '@symbiote/shared'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function eq(a: ReadonlyArray<string | number>, b: ReadonlyArray<string | number>): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// ── transformOrigin: the crash fix. CSS string -> [x, y, z] array. ──
const topLeft = processTransformOrigin('top left')
assert(eq(topLeft, [0, 0, 0]), `transformOrigin 'top left': expected [0,0,0], got ${JSON.stringify(topLeft)}`)

const halfFull = processTransformOrigin('50% 100%')
assert(
  eq(halfFull, ['50%', '100%', 0]),
  `transformOrigin '50% 100%': expected ['50%','100%',0], got ${JSON.stringify(halfFull)}`,
)

// Array input passes through unchanged (no regression for the already-working form).
const arrayOrigin = processTransformOrigin(['25%', '75%', 3])
assert(
  eq(arrayOrigin, ['25%', '75%', 3]),
  `transformOrigin array passthrough: got ${JSON.stringify(arrayOrigin)}`,
)

// ── aspectRatio: number passes through (no-op), ratio string parses. ──
assert(processAspectRatio(1.5) === 1.5, `aspectRatio number no-op: expected 1.5, got ${String(processAspectRatio(1.5))}`)

const ratio = processAspectRatio('16 / 9')
assert(
  ratio != null && Math.abs(ratio - 16 / 9) < 1e-9,
  `aspectRatio '16 / 9': expected ~1.778, got ${String(ratio)}`,
)
assert(processAspectRatio('1.5') === 1.5, `aspectRatio '1.5': expected 1.5, got ${String(processAspectRatio('1.5'))}`)
assert(processAspectRatio('auto') === undefined, `aspectRatio 'auto': expected undefined`)

// ── fontVariant: array passes through (no-op), string splits. ──
const variants = processFontVariant(['small-caps'])
assert(
  variants.length === 1 && variants[0] === 'small-caps',
  `fontVariant array passthrough: got ${JSON.stringify(variants)}`,
)

const splitVariants = processFontVariant('small-caps tabular-nums')
assert(
  splitVariants.length === 2 && splitVariants[0] === 'small-caps' && splitVariants[1] === 'tabular-nums',
  `fontVariant string split: got ${JSON.stringify(splitVariants)}`,
)

console.log('process-transform-origin: transformOrigin/aspectRatio/fontVariant parsed')
console.log('process-transform-origin.smoke OK')
