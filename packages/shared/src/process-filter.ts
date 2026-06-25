// JS-side port of RN's processFilter (Libraries/StyleSheet/processFilter.js).
// Same root cause as boxShadow: `filter` registers with enableNativeCSSParsing()
// (DEFAULT FALSE), so RN parses the CSS string / array in JS and forwards only the
// structured result. symbiote forwarded the raw value; the array form already worked
// (Fabric accepts it raw — `filter:[{brightness:0.5}]` was device-verified), but the
// CSS-string form and drop-shadow color processing were missing. This restores them.
//
// processColor is referenced from ./commit at RUNTIME only (inside function bodies),
// never at module-init, so the cyclic import (commit -> here -> commit) has no TDZ hazard.

import { processColor } from './commit'
import { isOpaqueColorValue } from './platform-color'
import { dlog } from './debug'

// RN processFilter.js:19-24 — pre-compiled patterns.
const NEWLINE_REGEX = /\n/g
const FILTER_FUNCTION_REGEX = /([\w-]+)\(([^()]*|\([^()]*\)|[^()]*\([^()]*\)[^()]*)\)/g
const ARGS_WITH_UNITS_REGEX = /([+-]?\d*(\.\d+)?)([a-zA-Z%]+)?/g
const WHITESPACE_SPLIT_REGEX = /\s+(?![^(]*\))/
const LENGTH_PARSE_REGEX = /([+-]?\d*(\.\d+)?)([\w\W]+)?/g

// RN processFilter.js:26-43. Each entry names exactly one filter; `color` on a parsed
// drop-shadow is whatever the platform processor returns, hence unknown.
export interface ParsedDropShadow {
  offsetX: number
  offsetY: number
  standardDeviation?: number
  color?: unknown
}

export type ParsedFilter =
  | { brightness: number }
  | { blur: number }
  | { contrast: number }
  | { grayscale: number }
  | { hueRotate: number }
  | { invert: number }
  | { opacity: number }
  | { saturate: number }
  | { sepia: number }
  | { dropShadow: ParsedDropShadow }

// The structured input shapes — declared locally so shared does not import @symbiote/react.
// Read loosely (callers pass plain records); each field is narrowed at the point of use.
type RawDropShadow = Record<string, unknown>
type RawFilterFunction = Record<string, unknown>

const RADIANS_TO_DEGREES = 180 / Math.PI

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// A length field may be a CSS string or a number; resolve to a number or null.
function resolveLength(value: unknown): number | null {
  if (typeof value === 'string') return parseLength(value)
  if (typeof value === 'number') return value
  return null
}

// A drop-shadow color may already be a platform int (number) or undefined; processColor
// only types CSS strings / opaque PlatformColor objects. Number passes through, anything
// else (incl. undefined) is null — unprocessable, like RN.
function processShadowColor(color: unknown): unknown {
  if (typeof color === 'number') return color
  if (typeof color === 'string' || isOpaqueColorValue(color)) return processColor(color)
  return null
}

// RN processFilter.js:45-124. Returns [] on any invalid primitive (web semantics: an
// invalid filter applies none of them, so the missing effect is obvious).
export function processFilter(
  filter: ReadonlyArray<RawFilterFunction> | string | undefined,
): ParsedFilter[] {
  const result: ParsedFilter[] = []
  if (filter == null) {
    return result
  }

  if (typeof filter === 'string') {
    const text = filter.replace(NEWLINE_REGEX, ' ')

    // Matches functions with args and nested functions like
    // "drop-shadow(10 10 10 rgba(0, 0, 0, 1))".
    FILTER_FUNCTION_REGEX.lastIndex = 0
    let matches: RegExpExecArray | null
    while ((matches = FILTER_FUNCTION_REGEX.exec(text)) !== null) {
      const filterName = matches[1].toLowerCase()
      if (filterName === 'drop-shadow') {
        const dropShadow = parseDropShadow(matches[2])
        if (dropShadow != null) {
          result.push({ dropShadow })
        } else {
          dlog(`processFilter reject: invalid drop-shadow "${matches[2]}"`)
          return []
        }
      } else {
        const camelizedName =
          filterName === 'hue-rotate' ? 'hueRotate' : filterName
        const amount = getFilterAmount(camelizedName, matches[2])
        if (amount != null) {
          result.push(filterEntry(camelizedName, amount))
        } else {
          dlog(`processFilter reject: invalid ${camelizedName} "${matches[2]}"`)
          return []
        }
      }
    }
  } else if (Array.isArray(filter)) {
    for (const filterFunction of filter) {
      const [filterName, filterValue] = Object.entries(filterFunction)[0]
      if (filterName === 'dropShadow') {
        const dropShadow = isDropShadowValue(filterValue)
          ? parseDropShadow(filterValue)
          : null
        if (dropShadow == null) {
          dlog(`processFilter reject: invalid dropShadow in array`)
          return []
        }
        result.push({ dropShadow })
      } else {
        const amount = getFilterAmount(filterName, filterValue)
        if (amount != null) {
          result.push(filterEntry(filterName, amount))
        } else {
          dlog(`processFilter reject: invalid ${filterName} in array`)
          return []
        }
      }
    }
  } else {
    throw new TypeError(`${typeof filter} filter is not a string or array`)
  }

  return result
}

// RN sets `filterFunction[camelizedName] = amount` and pushes the loose object. We
// build the discriminated union explicitly to keep it typed without an `as` cast.
function filterEntry(name: string, amount: number): ParsedFilter {
  switch (name) {
    case 'brightness':
      return { brightness: amount }
    case 'blur':
      return { blur: amount }
    case 'contrast':
      return { contrast: amount }
    case 'grayscale':
      return { grayscale: amount }
    case 'hueRotate':
      return { hueRotate: amount }
    case 'invert':
      return { invert: amount }
    case 'opacity':
      return { opacity: amount }
    case 'saturate':
      return { saturate: amount }
    default:
      return { sepia: amount }
  }
}

function isDropShadowValue(value: unknown): value is RawDropShadow | string {
  return typeof value === 'string' || (isRecord(value) && 'offsetX' in value)
}

// RN processFilter.js:126-186.
function getFilterAmount(filterName: string, filterArgs: unknown): number | undefined {
  let filterArgAsNumber: number
  let unit: string | undefined
  if (typeof filterArgs === 'string') {
    // Matches args with units like "1.5 5% -80deg".
    ARGS_WITH_UNITS_REGEX.lastIndex = 0
    const match = ARGS_WITH_UNITS_REGEX.exec(filterArgs)
    if (!match || isNaN(Number(match[1]))) {
      return undefined
    }
    filterArgAsNumber = Number(match[1])
    unit = match[3]
  } else if (typeof filterArgs === 'number') {
    filterArgAsNumber = filterArgs
  } else {
    return undefined
  }

  switch (filterName) {
    // hueRotate takes an angle that can carry a unit and be negative; bare 0 is allowed.
    case 'hueRotate':
      if (filterArgAsNumber === 0) {
        return 0
      }
      if (unit !== 'deg' && unit !== 'rad') {
        return undefined
      }
      return unit === 'rad' ? RADIANS_TO_DEGREES * filterArgAsNumber : filterArgAsNumber
    // blur takes any non-negative CSS length that is not a percent; RN only has DIPs.
    case 'blur':
      if ((unit != null && unit !== 'px') || filterArgAsNumber < 0) {
        return undefined
      }
      return filterArgAsNumber
    // The rest take a non-negative number or percentage (50% == 0.5).
    case 'brightness':
    case 'contrast':
    case 'grayscale':
    case 'invert':
    case 'opacity':
    case 'saturate':
    case 'sepia':
      if ((unit != null && unit !== '%' && unit !== 'px') || filterArgAsNumber < 0) {
        return undefined
      }
      return unit === '%' ? filterArgAsNumber / 100 : filterArgAsNumber
    default:
      return undefined
  }
}

// RN processFilter.js:188-256.
function parseDropShadow(
  rawDropShadow: string | RawDropShadow,
): ParsedDropShadow | null {
  const dropShadow =
    typeof rawDropShadow === 'string' ? parseDropShadowString(rawDropShadow) : rawDropShadow
  if (dropShadow == null) {
    return null
  }

  const parsedDropShadow: ParsedDropShadow = { offsetX: 0, offsetY: 0 }
  let offsetX: number | undefined
  let offsetY: number | undefined

  for (const arg of Object.keys(dropShadow)) {
    switch (arg) {
      case 'offsetX': {
        const value = resolveLength(dropShadow.offsetX)
        if (value == null) {
          return null
        }
        offsetX = value
        break
      }
      case 'offsetY': {
        const value = resolveLength(dropShadow.offsetY)
        if (value == null) {
          return null
        }
        offsetY = value
        break
      }
      case 'standardDeviation': {
        const value = resolveLength(dropShadow.standardDeviation)
        if (value == null || value < 0) {
          return null
        }
        parsedDropShadow.standardDeviation = value
        break
      }
      case 'color': {
        const color = processShadowColor(dropShadow.color)
        if (color == null) {
          return null
        }
        parsedDropShadow.color = color
        break
      }
      default:
        return null
    }
  }

  if (offsetX == null || offsetY == null) {
    return null
  }

  parsedDropShadow.offsetX = offsetX
  parsedDropShadow.offsetY = offsetY
  return parsedDropShadow
}

// RN processFilter.js:258-312.
function parseDropShadowString(rawDropShadow: string): RawDropShadow | null {
  const dropShadow: RawDropShadow = { offsetX: 0, offsetY: 0 }
  let offsetX: string | undefined
  let offsetY: string | undefined
  let lengthCount = 0
  let keywordDetectedAfterLength = false

  for (const arg of rawDropShadow.split(WHITESPACE_SPLIT_REGEX)) {
    const processedColor = processColor(arg)
    if (processedColor != null) {
      if (dropShadow.color != null) {
        return null
      }
      if (offsetX != null) {
        keywordDetectedAfterLength = true
      }
      dropShadow.color = arg
      continue
    }

    switch (lengthCount) {
      case 0:
        offsetX = arg
        lengthCount++
        break
      case 1:
        if (keywordDetectedAfterLength) {
          return null
        }
        offsetY = arg
        lengthCount++
        break
      case 2:
        if (keywordDetectedAfterLength) {
          return null
        }
        dropShadow.standardDeviation = arg
        lengthCount++
        break
      default:
        return null
    }
  }
  if (offsetX == null || offsetY == null) {
    return null
  }

  dropShadow.offsetX = offsetX
  dropShadow.offsetY = offsetY
  return dropShadow
}

// RN processFilter.js:314-332. Accepts a unitless 0 or any `<n>px`; rejects a non-zero
// unitless length or a non-px unit.
function parseLength(length: string): number | null {
  LENGTH_PARSE_REGEX.lastIndex = 0
  const match = LENGTH_PARSE_REGEX.exec(length)
  if (!match || isNaN(Number(match[1]))) {
    return null
  }
  if (match[3] != null && match[3] !== 'px') {
    return null
  }
  if (match[3] == null && match[1] !== '0') {
    return null
  }
  return Number(match[1])
}

export type { RawDropShadow, RawFilterFunction }
