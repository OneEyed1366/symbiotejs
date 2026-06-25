// JS-side port of RN's processTransformOrigin (Libraries/StyleSheet/processTransformOrigin.js).
// Same root cause as boxShadow/filter: ReactNativeStyleAttributes registers `transformOrigin`
// with `nativeCSSParsing ? true : {process: processTransformOrigin}`, and enableNativeCSSParsing()
// DEFAULTS TO FALSE — so RN's stock path runs processTransformOrigin IN JS, turning the CSS
// string ('top left') into the [x, y, z] array native expects. symbiote forwarded the raw
// string: iOS native tolerated it, Android native casts it to ReadableArray and crashes with
// `java.lang.String cannot be cast to com.facebook.react.bridge.ReadableArray`. This restores
// the missing JS parse so native always receives the [x, y, z] array.
//
// RN throws via invariant() on a malformed value; we instead dlog and keep the partial array
// (matching the boxShadow/filter idiom of never throwing into the commit path).

import { dlog } from './debug'

// RN processTransformOrigin.js:14 — pre-compiled pattern matching each keyword / length token.
const TRANSFORM_ORIGIN_REGEX = /(top|bottom|left|right|center|\d+(?:%|px)|0)/gi

// RN processTransformOrigin.js:16-18.
const INDEX_X = 0
const INDEX_Y = 1
const INDEX_Z = 2

type TransformOriginValue = string | number

// RN processTransformOrigin.js:21-120. Parses the CSS string into the [x, y, z] array,
// or normalizes/passes through an array input unchanged.
export function processTransformOrigin(
  transformOrigin: Array<TransformOriginValue> | string | undefined,
): Array<TransformOriginValue> {
  if (transformOrigin == null) {
    // RN never receives undefined here (the registry only calls the processor for a
    // present value), but the commit path may; default to center/center/0.
    return ['50%', '50%', 0]
  }

  if (typeof transformOrigin !== 'string') {
    // Array input passes through, like RN (which only re-validates in __DEV__).
    return transformOrigin
  }

  const transformOriginString = transformOrigin
  TRANSFORM_ORIGIN_REGEX.lastIndex = 0
  const transformOriginArray: Array<TransformOriginValue> = ['50%', '50%', 0]

  let index = INDEX_X
  let matches: RegExpExecArray | null
  outer: while ((matches = TRANSFORM_ORIGIN_REGEX.exec(transformOriginString))) {
    let nextIndex = index + 1

    const value = matches[0]
    const valueLower = value.toLowerCase()

    switch (valueLower) {
      case 'left':
      case 'right': {
        // RN processTransformOrigin.js:42-46 — left/right are x-only.
        if (index !== INDEX_X) {
          dlog(`processTransformOrigin reject: "${value}" can only be used for x-position`)
          return transformOriginArray
        }
        transformOriginArray[INDEX_X] = valueLower === 'left' ? 0 : '100%'
        break
      }
      case 'top':
      case 'bottom': {
        // RN processTransformOrigin.js:52-56 — top/bottom are not valid for z.
        if (index === INDEX_Z) {
          dlog(`processTransformOrigin reject: "${value}" can only be used for y-position`)
          return transformOriginArray
        }
        transformOriginArray[INDEX_Y] = valueLower === 'top' ? 0 : '100%'

        // RN processTransformOrigin.js:59-86 — handle [[ center | left | right ] &&
        // [ center | top | bottom ]] <length>?  When y came first, the next token is x.
        if (index === INDEX_X) {
          const horizontal = TRANSFORM_ORIGIN_REGEX.exec(transformOriginString)
          if (horizontal == null) {
            break outer
          }

          switch (horizontal[0].toLowerCase()) {
            case 'left':
              transformOriginArray[INDEX_X] = 0
              break
            case 'right':
              transformOriginArray[INDEX_X] = '100%'
              break
            case 'center':
              transformOriginArray[INDEX_X] = '50%'
              break
            default:
              dlog(`processTransformOrigin reject: could not parse "${transformOriginString}"`)
              return transformOriginArray
          }
          nextIndex = INDEX_Z
        }

        break
      }
      case 'center': {
        // RN processTransformOrigin.js:91-95 — center is invalid for z.
        if (index === INDEX_Z) {
          dlog(`processTransformOrigin reject: "${value}" cannot be used for z-position`)
          return transformOriginArray
        }
        transformOriginArray[index] = '50%'
        break
      }
      default: {
        // RN processTransformOrigin.js:99-105 — a percentage stays a string, a length
        // drops its `px` and becomes a number.
        if (value.endsWith('%')) {
          transformOriginArray[index] = value
        } else {
          transformOriginArray[index] = parseFloat(value)
        }
        break
      }
    }

    index = nextIndex
  }

  return transformOriginArray
}
