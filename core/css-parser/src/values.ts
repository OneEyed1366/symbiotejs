// CSS → React Native value conversion. RN style props take plain numbers for `px` / unitless
// values (there is no terminal-cell or DP grid to scale onto, unlike wolf-tui's TUI target), so
// unlike wolf-tui's `values.ts` there is no unit-to-cell division here — `px` is identity.

import valueParser from 'postcss-value-parser';

// symbiote has no root-font-size registry (a DOM `<html>` element would own one); we pick CSS's
// own default of a 16px root font size as the `rem` multiplier, so `2rem` reads as `32`.
const REM_TO_PX = 16;

const NUMBER_WITH_UNIT_PATTERN = /^(-?\d+(?:\.\d+)?)(px|rem|em)?$/;
const PERCENT_PATTERN = /%$/;

/**
 * Convert a CSS dimension to a plain number: strips `px`, scales `rem`/`em` by
 * {@link REM_TO_PX}, and passes unitless numbers through untouched.
 */
export function parseNumeric(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(NUMBER_WITH_UNIT_PATTERN);
  if (!match) {
    const bare = parseFloat(trimmed);
    return Number.isNaN(bare) ? 0 : bare;
  }

  const amount = parseFloat(match[1]);
  const unit = match[2];
  return unit === 'rem' || unit === 'em' ? amount * REM_TO_PX : amount;
}

/**
 * Same as {@link parseNumeric}, except a percentage value is kept as a string
 * (`'50%'`) — RN accepts percentage strings for most layout props.
 */
export function parseNumericOrPercent(value: string): number | string {
  const trimmed = value.trim();
  return PERCENT_PATTERN.test(trimmed) ? trimmed : parseNumeric(trimmed);
}

/**
 * Colors, font families, and CSS keyword values (`'bold'`, `'row'`, `'red'`) pass through
 * unchanged — RN accepts the same raw strings CSS does for these props.
 */
export function parseRawValue(value: string): string {
  return value.trim();
}

/**
 * Warn once per unique `key` across a {@link parseCSS} call (the caller-owned `warned` set is
 * shared with the plain-property drop warning in properties.ts, so every "unsupported X dropped"
 * message in this package dedupes the same way).
 */
export function warnOnce(warned: Set<string>, key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

//#region text-shadow
//
// NOTE: there is no `#region transform` / `#region box-shadow` here — both are registered in
// properties.ts's PROPERTY_TABLE as plain `raw` passthrough. RN's own JS pre-processors
// (`core/engine/src/process-transform`, `core/engine/src/process-box-shadow`) already parse
// this exact CSS syntax at commit time, so parsing it a second time here would just be a
// narrower, duplicate reimplementation — see the comments at those two PROPERTY_TABLE entries.

type IShadowTokens = {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  color: string;
};

// A length token always starts with a digit, `.`, or `-` (`0`, `2px`, `-4px`); a color token
// never does, whether it's a keyword (`red`), a hex (`#fff`), or a function (`rgba(0,0,0,.3)`) —
// so classifying by leading character separates them without needing a CSS color grammar.
const LENGTH_TOKEN_PATTERN = /^-?[\d.]/;

/** Split a `text-shadow` value on its TOP-LEVEL commas only — a comma inside a color function
 * (`rgba(0, 0, 0, .3)`) must not split a single shadow layer in two. */
function splitShadowLayers(value: string): string[] {
  const layers: string[] = [];
  let current: valueParser.Node[] = [];

  for (const node of valueParser(value.trim()).nodes) {
    if (node.type === 'div' && node.value === ',') {
      layers.push(valueParser.stringify(current).trim());
      current = [];
      continue;
    }
    current.push(node);
  }
  layers.push(valueParser.stringify(current).trim());

  return layers.filter(Boolean);
}

function parseShadowTokens(layer: string): IShadowTokens | null {
  const rawTokens = valueParser(layer)
    .nodes.filter(node => node.type !== 'space' && node.type !== 'div')
    .map(node => valueParser.stringify(node));

  const lengths = rawTokens.filter(token => LENGTH_TOKEN_PATTERN.test(token));
  const colorToken = rawTokens.find(token => !LENGTH_TOKEN_PATTERN.test(token));
  if (lengths.length < 2) return null;

  return {
    offsetX: parseNumeric(lengths[0]!),
    offsetY: parseNumeric(lengths[1]!),
    blurRadius: lengths[2] !== undefined ? parseNumeric(lengths[2]) : 0,
    color: colorToken ?? '#000000',
  };
}

/** `text-shadow` → RN's `textShadowColor`/`textShadowOffset`/`textShadowRadius` (no Android
 * elevation equivalent — RN has no elevation concept for text, and no engine-level processor
 * to defer to the way `box-shadow` does — see the PROPERTY_TABLE comment in properties.ts). */
export function parseTextShadow(
  value: string,
  warned: Set<string>,
): Record<string, unknown> | null {
  const layers = splitShadowLayers(value);
  if (layers.length > 1) {
    warnOnce(
      warned,
      'text-shadow:multiple',
      '[@symbiotejs/css-parser] multiple text-shadow layers are not supported, only the first is applied',
    );
  }

  const first = layers[0];
  if (!first) return null;

  const tokens = parseShadowTokens(first);
  if (!tokens) return null;

  return {
    textShadowColor: tokens.color,
    textShadowOffset: { width: tokens.offsetX, height: tokens.offsetY },
    textShadowRadius: tokens.blurRadius,
  };
}

//#endregion text-shadow

export { REM_TO_PX };
