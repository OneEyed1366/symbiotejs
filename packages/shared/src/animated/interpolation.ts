// Numeric interpolation, ported from React Native's AnimatedInterpolation.js
// (the pure `interpolate` / `createNumericInterpolation` math). Maps an input
// range to an output range through an easing function with configurable
// extrapolation. String/color interpolation is deferred (see ADR 0016) — this
// slice is scalar-only, so everything here is number -> number.

import { Easing, type EasingFunction } from './easing'

export type ExtrapolateType = 'extend' | 'identity' | 'clamp'

export interface InterpolationConfig {
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

function checkInfiniteRange(name: string, arr: readonly number[]): void {
  if (arr.length < 2) throw new Error(`${name} must have at least 2 elements`)
  if (arr.length === 2 && arr[0] === -Infinity && arr[1] === Infinity) {
    throw new Error(`${name} cannot be ]-infinity;+infinity[ ${String(arr)}`)
  }
}

export function checkValidRanges(
  inputRange: readonly number[],
  outputRange: readonly number[],
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
  config: InterpolationConfig,
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
