// JS-side port of RN's processBackgroundImage (Libraries/StyleSheet/processBackgroundImage.js).
// Same root cause as boxShadow/filter/transform: `experimental_backgroundImage` registers with
// enableNativeCSSParsing(), which DEFAULTS TO FALSE, so RN's stock path parses the CSS gradient
// string / structured array in JS and sends only the processed array to native — Fabric's C++
// never sees the raw string. This restores that missing JS parse.

import { isOpaqueColorValue, processColor } from '../platform-color';
import { dlog } from '../debug';
import { isRecord } from '../type-guards';
import type { IRadialGradientPosition, IRadialGradientShape, IRadialGradientSize } from '../styles';

// RN processBackgroundImage.js: pre-compiled patterns.
const NEWLINE_REGEX = /\n/g;
const GRADIENT_REGEX = /^(linear|radial)-gradient\(((?:\([^)]*\)|[^()])*)\)/;
const COMMA_SPLIT_REGEX = /,(?![^(]*\))/;
const WHITESPACE_SPLIT_REGEX = /\s+/;
const COLOR_STOP_PARTS_REGEX = /\S+\([^)]*\)|\S+/g;
const WHITESPACE_NORMALIZE_REGEX = /\s+/g;
const LINEAR_GRADIENT_DIRECTION_REGEX =
  /^to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?/i;
const LINEAR_GRADIENT_ANGLE_UNIT_REGEX = /^([+-]?\d*\.?\d+)(deg|grad|rad|turn)$/i;

type ILinearGradientDirection =
  { type: 'angle'; value: number } | { type: 'keyword'; value: string };

const LINEAR_GRADIENT_DEFAULT_DIRECTION: ILinearGradientDirection = { type: 'angle', value: 180 };
const DEFAULT_RADIAL_SHAPE: IRadialGradientShape = 'ellipse';
const DEFAULT_RADIAL_SIZE: IRadialGradientSize = 'farthest-corner';
const DEFAULT_RADIAL_POSITION: IRadialGradientPosition = { top: '50%', left: '50%' };

// A parsed color stop: `color` is whatever the platform color processor returns (a platform int
// on a real host) or `null` for the transition-hint syntax (`red, 20%, blue`); `position` is a
// resolved px number, a `'50%'` string, or `null` when the stop carries no explicit position.
export type IParsedColorStop = { color: unknown; position: number | string | null };

export type IParsedLinearGradient = {
  type: 'linear-gradient';
  direction: ILinearGradientDirection;
  colorStops: ReadonlyArray<IParsedColorStop>;
};

export type IParsedRadialGradient = {
  type: 'radial-gradient';
  shape: IRadialGradientShape;
  size: IRadialGradientSize;
  position: IRadialGradientPosition;
  colorStops: ReadonlyArray<IParsedColorStop>;
};

export type IParsedBackgroundImage = IParsedLinearGradient | IParsedRadialGradient;

// The structured input shape: mirrors react's BackgroundImageValue but declared locally to avoid
// a cross-package import cycle (shared must not depend on @symbiote-native/react). Read loosely: callers
// pass plain records, so each field is narrowed at the point of use — same idiom as
// process-box-shadow's IRawBoxShadow.
type IRawBackgroundImage = Record<string, unknown>;

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

// A color-stop position is a plain px number or a percentage string; anything else is invalid.
function isPositionValue(value: unknown): value is number | string {
  return typeof value === 'number' || (typeof value === 'string' && value.endsWith('%'));
}

// A gradient color may already be a platform int (array form) or a CSS string/PlatformColor
// object needing processColor; mirrors process-box-shadow's processShadowColor.
function processStopColor(color: unknown): unknown {
  if (typeof color === 'number') return color;
  if (typeof color === 'string' || isOpaqueColorValue(color)) return processColor(color);
  return null;
}

// RN processBackgroundImage.js's `getPositionFromCSSValue`: `px` resolves to a plain number,
// `%` stays a string, anything else is unresolvable (returns undefined, like RN's fallthrough).
function getPositionFromCSSValue(position: string): number | string | undefined {
  if (position.endsWith('px')) return parseFloat(position);
  if (position.endsWith('%')) return position;
  return undefined;
}

function getAngleInDegrees(angle: string): number | null {
  const match = angle.match(LINEAR_GRADIENT_ANGLE_UNIT_REGEX);
  if (!match || match[1] == null) return null;

  const value = parseFloat(match[1]);
  switch (match[2]) {
    case 'deg':
      return value;
    case 'grad':
      return value * 0.9;
    case 'rad':
      return (value * 180) / Math.PI;
    case 'turn':
      return value * 360;
    default:
      return null;
  }
}

function getDirectionForKeyword(direction: string): ILinearGradientDirection | null {
  const normalized = direction.replace(WHITESPACE_NORMALIZE_REGEX, ' ').toLowerCase();

  switch (normalized) {
    case 'to top':
      return { type: 'angle', value: 0 };
    case 'to right':
      return { type: 'angle', value: 90 };
    case 'to bottom':
      return { type: 'angle', value: 180 };
    case 'to left':
      return { type: 'angle', value: 270 };
    case 'to top right':
    case 'to right top':
      return { type: 'keyword', value: 'to top right' };
    case 'to bottom right':
    case 'to right bottom':
      return { type: 'keyword', value: 'to bottom right' };
    case 'to top left':
    case 'to left top':
      return { type: 'keyword', value: 'to top left' };
    case 'to bottom left':
    case 'to left bottom':
      return { type: 'keyword', value: 'to bottom left' };
    default:
      return null;
  }
}

//#region array form (structured objects, e.g. the animated / sticky-header hot path)

function resolveRadialShape(value: unknown): IRadialGradientShape | null {
  if (value == null) return DEFAULT_RADIAL_SHAPE;
  if (value === 'circle' || value === 'ellipse') return value;
  return null;
}

function resolveRadialSize(value: unknown): IRadialGradientSize | null {
  if (value == null) return DEFAULT_RADIAL_SIZE;
  if (
    value === 'closest-side' ||
    value === 'closest-corner' ||
    value === 'farthest-side' ||
    value === 'farthest-corner'
  ) {
    return value;
  }
  if (isRecord(value) && isStringOrNumber(value.x) && isStringOrNumber(value.y)) {
    return { x: value.x, y: value.y };
  }
  return null;
}

function isRadialPositionValue(value: unknown): value is IRadialGradientPosition {
  if (!isRecord(value)) return false;
  const hasVertical = isStringOrNumber(value.top) || isStringOrNumber(value.bottom);
  const hasHorizontal = isStringOrNumber(value.left) || isStringOrNumber(value.right);
  return hasVertical && hasHorizontal;
}

// RN processBackgroundImage.js's `processColorStops`. Returns `null` on any invalid stop (web
// semantics: an invalid gradient applies none of it, same as processBoxShadow/processFilter).
function processColorStopsArray(rawColorStops: unknown): IParsedColorStop[] | null {
  if (!Array.isArray(rawColorStops)) return null;
  const processed: IParsedColorStop[] = [];

  for (const rawStop of rawColorStops) {
    if (!isRecord(rawStop)) return null;
    const positions = rawStop.positions;

    // Color transition hint syntax (`red, 20%, blue`): a position with no color of its own.
    if (rawStop.color == null && Array.isArray(positions) && positions.length === 1) {
      const position = positions[0];
      if (!isPositionValue(position)) return null;
      processed.push({ color: null, position });
      continue;
    }

    const processedColor = processStopColor(rawStop.color);
    if (processedColor == null) return null;

    // Two+ positions on one color-stop object is CSS's shorthand for repeating that color at
    // each position (e.g. `red 0% 50%` == two adjacent stops both colored red).
    if (Array.isArray(positions) && positions.length > 0) {
      for (const position of positions) {
        if (!isPositionValue(position)) return null;
        processed.push({ color: processedColor, position });
      }
    } else {
      processed.push({ color: processedColor, position: null });
    }
  }

  return processed;
}

function processBackgroundImageArray(
  rawList: ReadonlyArray<IRawBackgroundImage>,
): IParsedBackgroundImage[] {
  const result: IParsedBackgroundImage[] = [];

  for (const rawBgImage of rawList) {
    const colorStops = processColorStopsArray(rawBgImage.colorStops);
    if (colorStops == null) {
      dlog('processBackgroundImage reject: invalid color stop');
      return [];
    }

    if (rawBgImage.type === 'linear-gradient') {
      let direction = LINEAR_GRADIENT_DEFAULT_DIRECTION;
      const rawDirection = rawBgImage.direction;
      const bgDirection = typeof rawDirection === 'string' ? rawDirection.toLowerCase() : null;

      if (bgDirection != null) {
        if (LINEAR_GRADIENT_ANGLE_UNIT_REGEX.test(bgDirection)) {
          const parsedAngle = getAngleInDegrees(bgDirection);
          if (parsedAngle == null) {
            dlog(`processBackgroundImage reject: invalid linear-gradient angle "${bgDirection}"`);
            return [];
          }
          direction = { type: 'angle', value: parsedAngle };
        } else if (LINEAR_GRADIENT_DIRECTION_REGEX.test(bgDirection)) {
          const parsedDirection = getDirectionForKeyword(bgDirection);
          if (parsedDirection == null) {
            dlog(
              `processBackgroundImage reject: invalid linear-gradient direction "${bgDirection}"`,
            );
            return [];
          }
          direction = parsedDirection;
        } else {
          dlog(`processBackgroundImage reject: invalid linear-gradient direction "${bgDirection}"`);
          return [];
        }
      }

      result.push({ type: 'linear-gradient', direction, colorStops });
      continue;
    }

    if (rawBgImage.type === 'radial-gradient') {
      const shape = resolveRadialShape(rawBgImage.shape);
      if (shape == null) {
        dlog('processBackgroundImage reject: invalid radial-gradient shape');
        return [];
      }
      const size = resolveRadialSize(rawBgImage.size);
      if (size == null) {
        dlog('processBackgroundImage reject: invalid radial-gradient size');
        return [];
      }
      const position = isRadialPositionValue(rawBgImage.position)
        ? rawBgImage.position
        : DEFAULT_RADIAL_POSITION;

      result.push({ type: 'radial-gradient', shape, size, position, colorStops });
    }
  }

  return result;
}

//#endregion array form

//#region CSS string form

// Split a `background-image` value on its TOP-LEVEL commas only (multiple gradients, or a
// color function's internal commas like `rgba(0, 0, 0, .3)`, must not be confused for one
// another) — depth-tracking instead of a lookahead regex because a gradient's own arg list can
// itself contain nested parens (`linear-gradient(to right, rgba(0,0,0,.5), blue)`).
function splitGradients(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of input) {
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim() !== '') result.push(current.trim());
  return result;
}

function parseColorStopsCSSString(parts: ReadonlyArray<string>): IParsedColorStop[] | null {
  const stops = parts.join(',').split(COMMA_SPLIT_REGEX);
  const colorStops: IParsedColorStop[] = [];
  let prevStopParts: RegExpMatchArray | null = null;

  for (let i = 0; i < stops.length; i++) {
    const trimmedStop = stops[i]!.trim().toLowerCase();
    const colorStopParts = trimmedStop.match(COLOR_STOP_PARTS_REGEX);
    if (colorStopParts == null) return null;

    if (colorStopParts.length === 3) {
      const position1 = getPositionFromCSSValue(colorStopParts[1]!);
      const position2 = getPositionFromCSSValue(colorStopParts[2]!);
      const processedColor = processStopColor(colorStopParts[0]!);
      if (processedColor == null || position1 == null || position2 == null) return null;
      colorStops.push({ color: processedColor, position: position1 });
      colorStops.push({ color: processedColor, position: position2 });
    } else if (colorStopParts.length === 2) {
      const position = getPositionFromCSSValue(colorStopParts[1]!);
      const processedColor = processStopColor(colorStopParts[0]!);
      if (processedColor == null || position == null) return null;
      colorStops.push({ color: processedColor, position });
    } else if (colorStopParts.length === 1) {
      const position = getPositionFromCSSValue(colorStopParts[0]!);
      if (position != null) {
        // Transition-hint syntax must have a color-bearing stop on both sides.
        const prevWasPositionOnly =
          prevStopParts != null &&
          prevStopParts.length === 1 &&
          getPositionFromCSSValue(prevStopParts[0]!) != null;
        if (prevWasPositionOnly || i === stops.length - 1 || i === 0) return null;
        colorStops.push({ color: null, position });
      } else {
        const processedColor = processStopColor(colorStopParts[0]!);
        if (processedColor == null) return null;
        colorStops.push({ color: processedColor, position: null });
      }
    } else {
      return null;
    }

    prevStopParts = colorStopParts;
  }

  return colorStops;
}

function parseLinearGradientCSSString(gradientContent: string): IParsedLinearGradient | null {
  const parts = gradientContent.split(',');
  let direction = LINEAR_GRADIENT_DEFAULT_DIRECTION;
  const trimmedDirection = (parts[0] ?? '').trim().toLowerCase();

  if (LINEAR_GRADIENT_ANGLE_UNIT_REGEX.test(trimmedDirection)) {
    const parsedAngle = getAngleInDegrees(trimmedDirection);
    if (parsedAngle == null) return null;
    direction = { type: 'angle', value: parsedAngle };
    parts.shift();
  } else if (LINEAR_GRADIENT_DIRECTION_REGEX.test(trimmedDirection)) {
    const parsedDirection = getDirectionForKeyword(trimmedDirection);
    if (parsedDirection == null) return null;
    direction = parsedDirection;
    parts.shift();
  }

  const colorStops = parseColorStopsCSSString(parts);
  if (colorStops == null) return null;

  return { type: 'linear-gradient', direction, colorStops };
}

// The `at <position>` clause of `radial-gradient(... at <position>, <color-stops>)`. Drains
// `tokens` (the SAME queue the caller is walking) via `shift()`, mirroring RN's in-place mutation
// of `firstPartTokens` — not a copy, so the caller sees it emptied after this returns.
function parseRadialGradientPositionTokens(tokens: string[]): IRadialGradientPosition | null {
  if (tokens.length === 0) return null;

  let top: string | number | undefined;
  let left: string | number | undefined;
  let right: string | number | undefined;
  let bottom: string | number | undefined;

  // 1. [ left | center | right | top | bottom | <length-percentage> ]
  if (tokens.length === 1) {
    const token = tokens.shift();
    if (token == null) return null;
    const tokenTrimmed = token.toLowerCase().trim();

    if (tokenTrimmed === 'left') {
      left = '0%';
      top = '50%';
    } else if (tokenTrimmed === 'center') {
      left = '50%';
      top = '50%';
    } else if (tokenTrimmed === 'right') {
      left = '100%';
      top = '50%';
    } else if (tokenTrimmed === 'top') {
      left = '50%';
      top = '0%';
    } else if (tokenTrimmed === 'bottom') {
      left = '50%';
      top = '100%';
    } else if (tokenTrimmed.endsWith('px') || tokenTrimmed.endsWith('%')) {
      const value = getPositionFromCSSValue(tokenTrimmed);
      if (value == null) return null;
      left = value;
      top = '50%';
    }
  }

  // 2. [ left | center | right ] && [ top | center | bottom ], or two length-percentages
  if (tokens.length === 2) {
    const t1 = tokens.shift();
    const t2 = tokens.shift();
    if (t1 == null || t2 == null) return null;

    const token1 = t1.toLowerCase().trim();
    const token2 = t2.toLowerCase().trim();
    const horizontalPositions = ['left', 'center', 'right'];
    const verticalPositions = ['top', 'center', 'bottom'];

    if (horizontalPositions.includes(token1) && verticalPositions.includes(token2)) {
      left = token1 === 'left' ? '0%' : token1 === 'center' ? '50%' : '100%';
      top = token2 === 'top' ? '0%' : token2 === 'center' ? '50%' : '100%';
    } else if (verticalPositions.includes(token1) && horizontalPositions.includes(token2)) {
      left = token2 === 'left' ? '0%' : token2 === 'center' ? '50%' : '100%';
      top = token1 === 'top' ? '0%' : token1 === 'center' ? '50%' : '100%';
    } else {
      if (token1 === 'left') left = '0%';
      else if (token1 === 'center') left = '50%';
      else if (token1 === 'right') left = '100%';
      else if (token1.endsWith('px') || token1.endsWith('%')) {
        const value = getPositionFromCSSValue(token1);
        if (value == null) return null;
        left = value;
      } else return null;

      if (token2 === 'top') top = '0%';
      else if (token2 === 'center') top = '50%';
      else if (token2 === 'bottom') top = '100%';
      else if (token2.endsWith('px') || token2.endsWith('%')) {
        const value = getPositionFromCSSValue(token2);
        if (value == null) return null;
        top = value;
      } else return null;
    }
  }

  // 3. [ [ left | right ] <length-percentage> ] && [ [ top | bottom ] <length-percentage> ]
  if (tokens.length === 4) {
    const [t1, t2, t3, t4] = tokens.splice(0, 4);
    if (t1 == null || t2 == null || t3 == null || t4 == null) return null;

    const keyword1 = t1.toLowerCase().trim();
    const value1 = getPositionFromCSSValue(t2.toLowerCase().trim());
    const keyword2 = t3.toLowerCase().trim();
    const value2 = getPositionFromCSSValue(t4.toLowerCase().trim());
    if (value1 == null || value2 == null) return null;

    if (keyword1 === 'left') left = value1;
    else if (keyword1 === 'right') right = value1;
    else if (keyword1 === 'top') top = value1;
    else if (keyword1 === 'bottom') bottom = value1;
    else return null;

    if (keyword2 === 'left') left = value2;
    else if (keyword2 === 'right') right = value2;
    else if (keyword2 === 'top') top = value2;
    else if (keyword2 === 'bottom') bottom = value2;
    else return null;
  }

  if (top != null && left != null) return { top, left };
  if (bottom != null && right != null) return { bottom, right };
  if (top != null && right != null) return { top, right };
  if (bottom != null && left != null) return { bottom, left };
  return null;
}

function parseRadialGradientCSSString(gradientContent: string): IParsedRadialGradient | null {
  let shape = DEFAULT_RADIAL_SHAPE;
  let size = DEFAULT_RADIAL_SIZE;
  let position: IRadialGradientPosition = { ...DEFAULT_RADIAL_POSITION };

  const parts = gradientContent.split(COMMA_SPLIT_REGEX);
  const firstPartStr = (parts[0] ?? '').trim();
  const remainingParts = [...parts];
  let hasShapeSizeOrPositionString = false;
  let hasExplicitSingleSize = false;
  let hasExplicitShape = false;
  const firstPartTokens = firstPartStr.split(WHITESPACE_SPLIT_REGEX);

  while (firstPartTokens.length > 0) {
    let token = firstPartTokens.shift();
    if (token == null) continue;
    let tokenTrimmed = token.toLowerCase().trim();

    if (tokenTrimmed === 'circle' || tokenTrimmed === 'ellipse') {
      shape = tokenTrimmed;
      hasShapeSizeOrPositionString = true;
      hasExplicitShape = true;
    } else if (
      tokenTrimmed === 'closest-corner' ||
      tokenTrimmed === 'farthest-corner' ||
      tokenTrimmed === 'closest-side' ||
      tokenTrimmed === 'farthest-side'
    ) {
      size = tokenTrimmed;
      hasShapeSizeOrPositionString = true;
    } else if (tokenTrimmed.endsWith('px') || tokenTrimmed.endsWith('%')) {
      const sizeX = getPositionFromCSSValue(tokenTrimmed);
      if (sizeX == null || (typeof sizeX === 'number' && sizeX < 0)) return null;
      hasShapeSizeOrPositionString = true;
      size = { x: sizeX, y: sizeX };

      token = firstPartTokens.shift();
      if (token == null) {
        hasExplicitSingleSize = true;
        continue;
      }
      tokenTrimmed = token.toLowerCase().trim();
      if (tokenTrimmed.endsWith('px') || tokenTrimmed.endsWith('%')) {
        const sizeY = getPositionFromCSSValue(tokenTrimmed);
        if (sizeY == null || (typeof sizeY === 'number' && sizeY < 0)) return null;
        size = { x: sizeX, y: sizeY };
      } else {
        hasExplicitSingleSize = true;
      }
    } else if (tokenTrimmed === 'at') {
      hasShapeSizeOrPositionString = true;
      const parsedPosition = parseRadialGradientPositionTokens(firstPartTokens);
      if (parsedPosition == null) return null;
      position = parsedPosition;
      break;
    }

    // No shape/size/position token found in this iteration — the rest of the first part is a
    // color stop, not gradient config.
    if (!hasShapeSizeOrPositionString) break;
  }

  if (hasShapeSizeOrPositionString) {
    remainingParts.shift();
    if (!hasExplicitShape && hasExplicitSingleSize) shape = 'circle';
    if (hasExplicitSingleSize && hasExplicitShape && shape === 'ellipse') return null;
  }

  const colorStops = parseColorStopsCSSString(remainingParts);
  if (colorStops == null) return null;

  return { type: 'radial-gradient', shape, size, position, colorStops };
}

function parseBackgroundImageCSSString(cssString: string): IParsedBackgroundImage[] {
  const gradients: IParsedBackgroundImage[] = [];

  for (const bgImageString of splitGradients(cssString)) {
    const bgImage = bgImageString.toLowerCase();
    const match = GRADIENT_REGEX.exec(bgImage);
    if (!match || match[1] == null || match[2] == null) continue;

    const isRadial = match[1].toLowerCase() === 'radial';
    const gradient = isRadial
      ? parseRadialGradientCSSString(match[2])
      : parseLinearGradientCSSString(match[2]);

    if (gradient != null) gradients.push(gradient);
  }

  return gradients;
}

//#endregion CSS string form

// RN processBackgroundImage.js's default export. Returns [] on any invalid gradient — web
// semantics: an invalid `background-image` paints none of it rather than a partial gradient.
export function processBackgroundImage(
  backgroundImage: ReadonlyArray<IRawBackgroundImage> | string | undefined,
): IParsedBackgroundImage[] {
  if (backgroundImage == null) return [];
  if (typeof backgroundImage === 'string') {
    return parseBackgroundImageCSSString(backgroundImage.replace(NEWLINE_REGEX, ' '));
  }
  return processBackgroundImageArray(backgroundImage);
}

export type { IRawBackgroundImage };
