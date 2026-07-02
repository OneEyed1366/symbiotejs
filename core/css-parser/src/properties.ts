// CSS property → React Native ViewStyle/TextStyle prop mapping. Unlike wolf-tui's
// `properties.ts` (which maps onto a terminal-cell `Styles` type with TUI-only concepts like
// `borderStyle: 'round'`), RN's own style props already mirror CSS's shorthand model 1:1
// (`margin`, `borderRadius`, `borderTopLeftRadius`, …), so this table is a flat kebab→camel
// rename plus a value-conversion kind — no shorthand expansion is needed.

import {
  parseNumeric,
  parseNumericOrPercent,
  parseRawValue,
  parseTextShadow,
  warnOnce,
} from './values.ts';

type IPropertyValueKind = 'number' | 'dimension' | 'raw';

type IPropertyMapping = {
  rnProperty: string;
  kind: IPropertyValueKind;
};

/**
 * kebab-case CSS property → { RN camelCase prop, value-conversion kind }.
 * `dimension` = number-or-percent (`parseNumericOrPercent`); `number` = always a plain
 * number (`parseNumeric`, no percent, e.g. `flexGrow`); `raw` = passthrough string
 * (colors, font family, enum keywords like `flexDirection`).
 */
export const PROPERTY_TABLE: Record<string, IPropertyMapping> = {
  // Flexbox / layout
  flex: { rnProperty: 'flex', kind: 'number' },
  'flex-direction': { rnProperty: 'flexDirection', kind: 'raw' },
  'flex-wrap': { rnProperty: 'flexWrap', kind: 'raw' },
  'flex-grow': { rnProperty: 'flexGrow', kind: 'number' },
  'flex-shrink': { rnProperty: 'flexShrink', kind: 'number' },
  'flex-basis': { rnProperty: 'flexBasis', kind: 'dimension' },
  'align-items': { rnProperty: 'alignItems', kind: 'raw' },
  'align-self': { rnProperty: 'alignSelf', kind: 'raw' },
  'align-content': { rnProperty: 'alignContent', kind: 'raw' },
  'justify-content': { rnProperty: 'justifyContent', kind: 'raw' },
  width: { rnProperty: 'width', kind: 'dimension' },
  height: { rnProperty: 'height', kind: 'dimension' },
  'min-width': { rnProperty: 'minWidth', kind: 'dimension' },
  'min-height': { rnProperty: 'minHeight', kind: 'dimension' },
  'max-width': { rnProperty: 'maxWidth', kind: 'dimension' },
  'max-height': { rnProperty: 'maxHeight', kind: 'dimension' },
  position: { rnProperty: 'position', kind: 'raw' },
  top: { rnProperty: 'top', kind: 'dimension' },
  right: { rnProperty: 'right', kind: 'dimension' },
  bottom: { rnProperty: 'bottom', kind: 'dimension' },
  left: { rnProperty: 'left', kind: 'dimension' },
  'z-index': { rnProperty: 'zIndex', kind: 'number' },
  overflow: { rnProperty: 'overflow', kind: 'raw' },
  // Only `flex`/`none` are valid RN values; passed through unvalidated per spec.
  display: { rnProperty: 'display', kind: 'raw' },
  // A genuine 1:1 CSS property (unlike transform/shadow — no shape mismatch), just missing
  // from the initial table. `2 / 3` string ratios are not accepted here (`parseNumeric`
  // requires a plain number) — CSS `aspect-ratio: 0.667` works, `aspect-ratio: 2/3` doesn't yet.
  'aspect-ratio': { rnProperty: 'aspectRatio', kind: 'number' },
  gap: { rnProperty: 'gap', kind: 'dimension' },
  'row-gap': { rnProperty: 'rowGap', kind: 'dimension' },
  'column-gap': { rnProperty: 'columnGap', kind: 'dimension' },
  // Passed through as raw CSS text, UNPARSED — RN's own JS pre-processors
  // (`core/engine/src/process-transform`, ported from RN's `processTransform.js`) already parse
  // this exact CSS-function-list syntax at commit time (`enableNativeCSSParsing()` defaults to
  // `false`, so RN's stock path always runs this JS parse before native, regardless of what
  // produced the string). Re-parsing it here would duplicate that logic and, being a narrower
  // reimplementation, would regress real RN features (`matrix()`, `perspective()`,
  // `translate3d()`) the engine's port already handles.
  transform: { rnProperty: 'transform', kind: 'raw' },
  // Same reasoning as `transform`: `core/engine/src/process-box-shadow` already parses this
  // exact CSS syntax at commit time, including multi-shadow lists, `inset`, and spread-radius —
  // all of which RN's native `boxShadow` prop genuinely supports (Fabric, both platforms).
  'box-shadow': { rnProperty: 'boxShadow', kind: 'raw' },
  // Same reasoning as `transform`/`box-shadow`: `core/engine/src/process-filter` already parses
  // this exact CSS filter-function-list syntax (`brightness()`, `blur()`, `drop-shadow()`, …) at
  // commit time, ported from RN's own `processFilter.js`.
  filter: { rnProperty: 'filter', kind: 'raw' },
  // Same reasoning again: `core/engine/src/process-transform-origin` already parses this exact
  // CSS syntax (keyword/length/percentage pairs, e.g. `top left`, `50% 100%`) at commit time,
  // ported from RN's own `processTransformOrigin.js`.
  'transform-origin': { rnProperty: 'transformOrigin', kind: 'raw' },
  // Same reasoning again: `core/engine/src/process-background-image` already parses this exact
  // CSS gradient syntax (`linear-gradient(...)`/`radial-gradient(...)`) at commit time, ported
  // from RN's own `processBackgroundImage.js`. RN's own style prop is itself named with an
  // `experimental_` prefix (still evolving upstream), which is why the RN key doesn't just
  // match a kebab→camel rename of the CSS property the way every other entry here does.
  'background-image': { rnProperty: 'experimental_backgroundImage', kind: 'raw' },

  // Spacing
  margin: { rnProperty: 'margin', kind: 'dimension' },
  'margin-top': { rnProperty: 'marginTop', kind: 'dimension' },
  'margin-right': { rnProperty: 'marginRight', kind: 'dimension' },
  'margin-bottom': { rnProperty: 'marginBottom', kind: 'dimension' },
  'margin-left': { rnProperty: 'marginLeft', kind: 'dimension' },
  padding: { rnProperty: 'padding', kind: 'dimension' },
  'padding-top': { rnProperty: 'paddingTop', kind: 'dimension' },
  'padding-right': { rnProperty: 'paddingRight', kind: 'dimension' },
  'padding-bottom': { rnProperty: 'paddingBottom', kind: 'dimension' },
  'padding-left': { rnProperty: 'paddingLeft', kind: 'dimension' },

  // Border
  'border-width': { rnProperty: 'borderWidth', kind: 'dimension' },
  'border-top-width': { rnProperty: 'borderTopWidth', kind: 'dimension' },
  'border-right-width': { rnProperty: 'borderRightWidth', kind: 'dimension' },
  'border-bottom-width': { rnProperty: 'borderBottomWidth', kind: 'dimension' },
  'border-left-width': { rnProperty: 'borderLeftWidth', kind: 'dimension' },
  'border-color': { rnProperty: 'borderColor', kind: 'raw' },
  'border-top-color': { rnProperty: 'borderTopColor', kind: 'raw' },
  'border-right-color': { rnProperty: 'borderRightColor', kind: 'raw' },
  'border-bottom-color': { rnProperty: 'borderBottomColor', kind: 'raw' },
  'border-left-color': { rnProperty: 'borderLeftColor', kind: 'raw' },
  'border-radius': { rnProperty: 'borderRadius', kind: 'dimension' },
  'border-top-left-radius': { rnProperty: 'borderTopLeftRadius', kind: 'dimension' },
  'border-top-right-radius': { rnProperty: 'borderTopRightRadius', kind: 'dimension' },
  'border-bottom-left-radius': { rnProperty: 'borderBottomLeftRadius', kind: 'dimension' },
  'border-bottom-right-radius': { rnProperty: 'borderBottomRightRadius', kind: 'dimension' },
  'border-style': { rnProperty: 'borderStyle', kind: 'raw' },

  // Visual
  'background-color': { rnProperty: 'backgroundColor', kind: 'raw' },
  opacity: { rnProperty: 'opacity', kind: 'number' },

  // Text
  color: { rnProperty: 'color', kind: 'raw' },
  'font-size': { rnProperty: 'fontSize', kind: 'dimension' },
  'font-weight': { rnProperty: 'fontWeight', kind: 'raw' },
  'font-family': { rnProperty: 'fontFamily', kind: 'raw' },
  'font-style': { rnProperty: 'fontStyle', kind: 'raw' },
  'text-align': { rnProperty: 'textAlign', kind: 'raw' },
  'text-decoration-line': { rnProperty: 'textDecorationLine', kind: 'raw' },
  'line-height': { rnProperty: 'lineHeight', kind: 'dimension' },
  'letter-spacing': { rnProperty: 'letterSpacing', kind: 'dimension' },
};

function convertValue(kind: IPropertyValueKind, value: string): number | string {
  switch (kind) {
    case 'number':
      return parseNumeric(value);
    case 'dimension':
      return parseNumericOrPercent(value);
    case 'raw':
      return parseRawValue(value);
  }
}

/**
 * Map one CSS declaration to its RN style entry. Returns `null` and warns once per unique
 * unsupported property name (deduped via the caller-owned `warnedProperties` set, so the
 * warning fires once per {@link parseCSS} call, not per occurrence).
 *
 * `text-shadow` bypasses {@link PROPERTY_TABLE}: RN has no unified CSS-string `textShadow` prop
 * (unlike `transform`/`box-shadow` above) — only three separate legacy props
 * (`textShadowColor`/`Offset`/`Radius`) that take already-decomposed values, so this package is
 * the only place that CAN parse the CSS shorthand; there is no engine-level processor to defer to.
 */
export function mapCSSProperty(
  prop: string,
  value: string,
  warnedProperties: Set<string>,
): Record<string, unknown> | null {
  if (prop === 'text-shadow') return parseTextShadow(value, warnedProperties);

  const mapping = PROPERTY_TABLE[prop];
  if (!mapping) {
    warnOnce(
      warnedProperties,
      prop,
      `[@symbiote/css-parser] unsupported CSS property "${prop}" dropped`,
    );
    return null;
  }

  return { [mapping.rnProperty]: convertValue(mapping.kind, value) };
}
