// JS-side port of RN's processBoxShadow (Libraries/StyleSheet/processBoxShadow.js).
// RN registers `boxShadow` with enableNativeCSSParsing(), which DEFAULTS TO FALSE, so
// the stock path parses the CSS string / structured array in JS and sends only the
// processed array to native; Fabric's C++ never sees the raw string. symbiote was
// forwarding the raw value, which native (CSS parsing off) silently ignores: shadow
// rendered nothing. This restores the missing JS parse + per-color processColor.

import { isOpaqueColorValue, processColor } from '../platform-color';
import { dlog } from '../debug';

// RN processBoxShadow.js:16-19: split args only on the delimiters that are NOT inside
// a parenthesized color like rgba(0,0,0,1).
const COMMA_SPLIT_REGEX = /,(?![^()]*\))/;
const WHITESPACE_SPLIT_REGEX = /\s+(?![^(]*\))/;
const LENGTH_PARSE_REGEX = /^([+-]?\d*\.?\d+)(px)?$/;
const NEWLINE_REGEX = /\n/g;

// RN processBoxShadow.js:21-28 (ParsedBoxShadow). `color` is whatever the platform
// processor returns (a platform int on a real host), so it is left as unknown here.
export interface IParsedBoxShadow {
  offsetX: number;
  offsetY: number;
  color?: unknown;
  blurRadius?: number;
  spreadDistance?: number;
  inset?: boolean;
}

// The structured input shape: mirrors react's BoxShadowValue but declared locally to
// avoid a cross-package import cycle (shared must not depend on @symbiote-native/react). Read
// loosely: callers pass plain records, so each field is narrowed at the point of use.
type IRawBoxShadow = Record<string, unknown>;

// A length field may be a CSS string ("22px") or a number; resolve to a number or null.
// Mirrors RN's `typeof x === 'string' ? parseLength(x) : x`, but typed from `unknown`.
function resolveLength(value: unknown): number | null {
  if (typeof value === 'string') return parseLength(value);
  if (typeof value === 'number') return value;
  return null;
}

// A shadow color may already be a platform int (number) or undefined; processColor only
// types CSS strings / opaque PlatformColor objects. A number is passed through (already
// resolved), anything else (incl. undefined) is null, i.e. unprocessable, like RN.
function processShadowColor(color: unknown): unknown {
  if (typeof color === 'number') return color;
  if (typeof color === 'string' || isOpaqueColorValue(color)) return processColor(color);
  return null;
}

// RN processBoxShadow.js:30-111. Returns [] on any invalid primitive (matches web: an
// invalid box-shadow paints nothing rather than a partial shadow).
export function processBoxShadow(
  rawBoxShadows: ReadonlyArray<IRawBoxShadow> | string | undefined,
): IParsedBoxShadow[] {
  const result: IParsedBoxShadow[] = [];
  if (rawBoxShadows == null) {
    return result;
  }

  const boxShadowList =
    typeof rawBoxShadows === 'string'
      ? parseBoxShadowString(rawBoxShadows.replace(NEWLINE_REGEX, ' '))
      : rawBoxShadows;

  for (const rawBoxShadow of boxShadowList) {
    const parsedBoxShadow: IParsedBoxShadow = { offsetX: 0, offsetY: 0 };

    for (const arg of Object.keys(rawBoxShadow)) {
      switch (arg) {
        case 'offsetX': {
          const value = resolveLength(rawBoxShadow.offsetX);
          if (value == null) {
            dlog(`processBoxShadow reject: invalid offsetX "${String(rawBoxShadow.offsetX)}"`);
            return [];
          }
          parsedBoxShadow.offsetX = value;
          break;
        }
        case 'offsetY': {
          const value = resolveLength(rawBoxShadow.offsetY);
          if (value == null) {
            dlog(`processBoxShadow reject: invalid offsetY "${String(rawBoxShadow.offsetY)}"`);
            return [];
          }
          parsedBoxShadow.offsetY = value;
          break;
        }
        case 'spreadDistance': {
          const value = resolveLength(rawBoxShadow.spreadDistance);
          if (value == null) {
            dlog(`processBoxShadow reject: invalid spreadDistance`);
            return [];
          }
          parsedBoxShadow.spreadDistance = value;
          break;
        }
        case 'blurRadius': {
          const value = resolveLength(rawBoxShadow.blurRadius);
          if (value == null || value < 0) {
            dlog(`processBoxShadow reject: invalid blurRadius`);
            return [];
          }
          parsedBoxShadow.blurRadius = value;
          break;
        }
        case 'color': {
          const color = processShadowColor(rawBoxShadow.color);
          if (color == null) {
            dlog(`processBoxShadow reject: unprocessable color`);
            return [];
          }
          parsedBoxShadow.color = color;
          break;
        }
        case 'inset':
          if (typeof rawBoxShadow.inset === 'boolean') parsedBoxShadow.inset = rawBoxShadow.inset;
      }
    }
    result.push(parsedBoxShadow);
  }
  return result;
}

// RN processBoxShadow.js:113-197. Walks each comma-separated shadow, classifying each
// whitespace-separated arg as a color, the `inset` keyword, or a length by position.
function parseBoxShadowString(rawBoxShadows: string): IRawBoxShadow[] {
  const result: IRawBoxShadow[] = [];

  for (const rawBoxShadow of rawBoxShadows
    .split(COMMA_SPLIT_REGEX)
    .map(bS => bS.trim())
    .filter(bS => bS !== '')) {
    const boxShadow: IRawBoxShadow = { offsetX: 0, offsetY: 0 };
    let offsetX: number | string | undefined;
    let offsetY: number | string | undefined;
    let keywordDetectedAfterLength = false;
    let lengthCount = 0;

    const args = rawBoxShadow.split(WHITESPACE_SPLIT_REGEX);
    for (const arg of args) {
      const processedColor = processColor(arg);
      if (processedColor != null) {
        if (boxShadow.color != null) {
          return [];
        }
        if (offsetX != null) {
          keywordDetectedAfterLength = true;
        }
        boxShadow.color = arg;
        continue;
      }

      if (arg === 'inset') {
        if (boxShadow.inset != null) {
          return [];
        }
        if (offsetX != null) {
          keywordDetectedAfterLength = true;
        }
        boxShadow.inset = true;
        continue;
      }

      switch (lengthCount) {
        case 0:
          offsetX = arg;
          lengthCount++;
          break;
        case 1:
          if (keywordDetectedAfterLength) {
            return [];
          }
          offsetY = arg;
          lengthCount++;
          break;
        case 2:
          if (keywordDetectedAfterLength) {
            return [];
          }
          boxShadow.blurRadius = arg;
          lengthCount++;
          break;
        case 3:
          if (keywordDetectedAfterLength) {
            return [];
          }
          boxShadow.spreadDistance = arg;
          lengthCount++;
          break;
        default:
          return [];
      }
    }

    if (offsetX == null || offsetY == null) {
      return [];
    }

    boxShadow.offsetX = offsetX;
    boxShadow.offsetY = offsetY;
    result.push(boxShadow);
  }
  return result;
}

// RN processBoxShadow.js:199-214. Accepts a unitless 0 or any `<n>px`; rejects a
// non-zero number with no unit (CSS requires a unit on lengths).
function parseLength(length: string): number | null {
  const match = LENGTH_PARSE_REGEX.exec(length);
  if (!match) {
    return null;
  }
  const value = parseFloat(match[1]);
  if (match[2] == null && value !== 0) {
    return null;
  }
  return value;
}

// Re-exported above for ParsedBoxShadow; the input shape stays internal.
export type { IRawBoxShadow };
