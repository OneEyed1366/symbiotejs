// Co-located unit test (ADR 0025): transformOrigin/aspectRatio/fontVariant are JS-parsed before
// Fabric (enableNativeCSSParsing defaults to false, so the processor runs in JS). A raw
// `transformOrigin: 'top left'` string reaching Android native crashed casting String to
// ReadableArray. These processors restore RN's JS parse. Expected outputs are RN-exact.

import { describe, expect, it } from 'vitest';
import { processTransformOrigin } from './index';
import { processAspectRatio } from '../process-aspect-ratio';
import { processFontVariant } from '../process-font-variant';

describe('processTransformOrigin', () => {
  it("parses 'top left' to [0, 0, 0] (the crash fix)", () => {
    expect(processTransformOrigin('top left')).toEqual([0, 0, 0]);
  });

  it("parses '50% 100%' keeping percentages as strings, z defaults to 0", () => {
    expect(processTransformOrigin('50% 100%')).toEqual(['50%', '100%', 0]);
  });

  it('passes an array input through unchanged', () => {
    expect(processTransformOrigin(['25%', '75%', 3])).toEqual(['25%', '75%', 3]);
  });
});

describe('processAspectRatio', () => {
  it('passes a number through (no-op)', () => {
    expect(processAspectRatio(1.5)).toBe(1.5);
  });

  it("parses a '16 / 9' ratio string", () => {
    const ratio = processAspectRatio('16 / 9');
    expect(ratio).toBeCloseTo(16 / 9, 9);
  });

  it("parses a plain numeric string '1.5'", () => {
    expect(processAspectRatio('1.5')).toBe(1.5);
  });

  it("returns undefined for 'auto'", () => {
    expect(processAspectRatio('auto')).toBeUndefined();
  });
});

describe('processFontVariant', () => {
  it('passes an array through unchanged (no-op)', () => {
    expect(processFontVariant(['small-caps'])).toEqual(['small-caps']);
  });

  it('splits a space-separated string', () => {
    expect(processFontVariant('small-caps tabular-nums')).toEqual(['small-caps', 'tabular-nums']);
  });
});
