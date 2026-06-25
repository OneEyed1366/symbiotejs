// Interpolation, ported from React Native's AnimatedInterpolation.js (the pure
// `interpolate` math plus the string/color output-range branch). Maps an input
// range to an output range through an easing function with configurable
// extrapolation. A numeric output range stays number -> number; a string output
// range (values-with-units like '0deg' or colors like '#000') is interpolated
// per numeric token and reassembled — see createStringInterpolation below.

import { normalizeColor, type RgbaValue } from './color'
import { Easing, type EasingFunction } from './easing'

export type ExtrapolateType = 'extend' | 'identity' | 'clamp'

export interface InterpolationConfig {
  inputRange: readonly number[]
  outputRange: readonly number[] | readonly string[]
  easing?: EasingFunction
  extrapolate?: ExtrapolateType
  extrapolateLeft?: ExtrapolateType
  extrapolateRight?: ExtrapolateType
}

// The numeric-output subset, used by the scalar path and by the per-token
// interpolations the string path builds.
interface NumericInterpolationConfig {
  inputRange: readonly number[]
  outputRange: readonly number[]
  easing?: EasingFunction
  extrapolate?: ExtrapolateType
  extrapolateLeft?: ExtrapolateType
  extrapolateRight?: ExtrapolateType
}

function interpolateSegment(
  input: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number,
  easing: EasingFunction,
  extrapolateLeft: ExtrapolateType,
  extrapolateRight: ExtrapolateType,
): number {
  let result = input

  // Extrapolate below the range.
  if (result < inputMin) {
    if (extrapolateLeft === 'identity') return result
    if (extrapolateLeft === 'clamp') result = inputMin
    // 'extend' falls through (no-op).
  }

  // Extrapolate above the range.
  if (result > inputMax) {
    if (extrapolateRight === 'identity') return result
    if (extrapolateRight === 'clamp') result = inputMax
    // 'extend' falls through (no-op).
  }

  if (outputMin === outputMax) return outputMin

  if (inputMin === inputMax) {
    return input <= inputMin ? outputMin : outputMax
  }

  // Normalize into the input segment.
  if (inputMin === -Infinity) {
    result = -result
  } else if (inputMax === Infinity) {
    result = result - inputMin
  } else {
    result = (result - inputMin) / (inputMax - inputMin)
  }

  result = easing(result)

  // Project onto the output segment.
  if (outputMin === -Infinity) {
    result = -result
  } else if (outputMax === Infinity) {
    result = result + outputMin
  } else {
    result = result * (outputMax - outputMin) + outputMin
  }

  return result
}

function findRange(input: number, inputRange: readonly number[]): number {
  let i = 1
  for (; i < inputRange.length - 1; ++i) {
    if (inputRange[i] >= input) break
  }
  return i - 1
}

function checkValidInputRange(arr: readonly number[]): void {
  if (arr.length < 2) throw new Error('inputRange must have at least 2 elements')
  for (let i = 1; i < arr.length; ++i) {
    if (!(arr[i] >= arr[i - 1])) {
      throw new Error(`inputRange must be monotonically non-decreasing ${String(arr)}`)
    }
  }
}

function checkInfiniteRange(
  name: string,
  arr: readonly number[] | readonly string[],
): void {
  if (arr.length < 2) throw new Error(`${name} must have at least 2 elements`)
  if (arr.length === 2 && arr[0] === -Infinity && arr[1] === Infinity) {
    throw new Error(`${name} cannot be ]-infinity;+infinity[ ${String(arr)}`)
  }
}

export function checkValidRanges(
  inputRange: readonly number[],
  outputRange: readonly number[] | readonly string[],
): void {
  checkInfiniteRange('outputRange', outputRange)
  checkInfiniteRange('inputRange', inputRange)
  checkValidInputRange(inputRange)
  if (inputRange.length !== outputRange.length) {
    throw new Error(
      `inputRange (${inputRange.length}) and outputRange (${outputRange.length}) must have the same length`,
    )
  }
}

export function createNumericInterpolation(
  config: NumericInterpolationConfig,
): (input: number) => number {
  const { inputRange, outputRange } = config
  const easing = config.easing ?? Easing.linear

  const extrapolateLeft: ExtrapolateType =
    config.extrapolateLeft ?? config.extrapolate ?? 'extend'
  const extrapolateRight: ExtrapolateType =
    config.extrapolateRight ?? config.extrapolate ?? 'extend'

  return (input) => {
    const range = findRange(input, inputRange)
    return interpolateSegment(
      input,
      inputRange[range],
      inputRange[range + 1],
      outputRange[range],
      outputRange[range + 1],
      easing,
      extrapolateLeft,
      extrapolateRight,
    )
  }
}

// One numeric token: a signed int/float with optional fraction and exponent.
// Sweeps a string for these so the surrounding non-numeric text (units, commas,
// 'rgba(' ... ')') survives as the template. Ported from RN
// AnimatedInterpolation.js:183.
const numericComponentRegex = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g

// A color output value, split into its four channels.
interface ColorComponents {
  isColor: true
  components: [number, number, number, number]
}
// A string-with-units output value, split into alternating numeric tokens and
// the literal template segments between them.
interface TemplateComponents {
  isColor: false
  components: ReadonlyArray<number | string>
}

// Split one output string into numeric components plus surrounding template.
// A parseable color collapses to four channels (r,g,b 0-255, a 0-1) via the
// shared color.ts RGBA decoder; any other string keeps its non-numeric text so
// it can be rebuilt around the interpolated numbers. Ported from RN
// AnimatedInterpolation.js:186 (mapStringToNumericComponents), with RN's packed-
// int decode replaced by color.ts's RgbaValue (DRY — one RGBA parser).
function mapStringToNumericComponents(
  input: string,
): ColorComponents | TemplateComponents {
  const color: RgbaValue | undefined = normalizeColor(input)
  if (color !== undefined) {
    return { isColor: true, components: [color.r, color.g, color.b, color.a] }
  }

  const components: Array<number | string> = []
  let lastMatchEnd = 0
  let match: RegExpExecArray | null
  numericComponentRegex.lastIndex = 0
  while ((match = numericComponentRegex.exec(input)) !== null) {
    if (match.index > lastMatchEnd) {
      components.push(input.substring(lastMatchEnd, match.index))
    }
    components.push(Number.parseFloat(match[0]))
    lastMatchEnd = match.index + match[0].length
  }
  if (components.length === 0) {
    throw new Error('outputRange must contain color or value with numeric component')
  }
  if (lastMatchEnd < input.length) {
    components.push(input.substring(lastMatchEnd))
  }
  return { isColor: false, components }
}

// Interpolate a string output range. Each output string is decomposed into its
// numeric tokens (and, for non-colors, the literal template between them); one
// numeric interpolation is built per token position; at evaluation time the
// tokens are interpolated and recombined into a string of the original shape:
//
//   '0deg' -> '360deg'              value-with-units  -> '180deg' at 0.5
//   '#000000' -> '#ffffff'          color             -> 'rgba(128, 128, 128, 1)'
//
// Ported from RN AnimatedInterpolation.js:234 (createStringInterpolation).
function createStringInterpolation(
  config: InterpolationConfig,
  outputRange: readonly string[],
): (input: number) => string {
  if (outputRange.length < 2) throw new Error('Bad output range')
  const decomposed = outputRange.map(mapStringToNumericComponents)

  const isColor = decomposed[0].isColor
  if (!decomposed.every((output) => output.isColor === isColor)) {
    throw new Error(
      'All elements of output range should either be a color or a string with numeric components',
    )
  }
  const firstLength = decomposed[0].components.length
  if (!decomposed.every((output) => output.components.length === firstLength)) {
    throw new Error('All elements of output range should have the same number of components')
  }

  // Per token position, the numeric values across all output strings — a number
  // output range the scalar path can interpolate. Colors are already all-numeric;
  // templates keep only the numeric tokens (the literal text is rejoined later).
  const numericComponents: ReadonlyArray<ReadonlyArray<number>> = decomposed.map((output) =>
    output.isColor
      ? output.components
      : output.components.filter((c): c is number => typeof c === 'number'),
  )
  const interpolations = numericComponents[0].map((_, tokenIndex) =>
    createNumericInterpolation({
      inputRange: config.inputRange,
      outputRange: numericComponents.map((components) => components[tokenIndex]),
      easing: config.easing,
      extrapolate: config.extrapolate,
      extrapolateLeft: config.extrapolateLeft,
      extrapolateRight: config.extrapolateRight,
    }),
  )

  if (!isColor) {
    // Walk the first output's template, dropping each interpolated number into
    // the slot its numeric token occupied and copying the literal text through.
    const template = decomposed[0].components
    return (input) => {
      const values = interpolations.map((interpolation) => interpolation(input))
      let i = 0
      return template.map((c) => (typeof c === 'number' ? values[i++] : c)).join('')
    }
  }

  // Colors: r,g,b must be integers, so round them; alpha stays continuous but is
  // rounded to 3 decimals to match RN's output. Matches RN
  // AnimatedInterpolation.js:288-296.
  return (input) => {
    const channels = interpolations.map((interpolation, i) => {
      const value = interpolation(input)
      return i < 3 ? Math.round(value) : Math.round(value * 1000) / 1000
    })
    return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${channels[3]})`
  }
}

function isStringOutputRange(
  outputRange: readonly number[] | readonly string[],
): outputRange is readonly string[] {
  return typeof outputRange[0] === 'string'
}

// Dispatch on the output range's element type: a string range (units or colors)
// goes through createStringInterpolation, a numeric range through the scalar
// path. Mirrors RN AnimatedInterpolation.js:373 (_getInterpolation).
export function createInterpolation(
  config: InterpolationConfig,
): (input: number) => number | string {
  if (isStringOutputRange(config.outputRange)) {
    return createStringInterpolation(config, config.outputRange)
  }
  return createNumericInterpolation({ ...config, outputRange: config.outputRange })
}
