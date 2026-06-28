// Co-located unit test (ADR 0025): boxShadow/filter are JS-parsed before Fabric. RN registers
// these behind enableNativeCSSParsing (default false), so a raw string is dropped on device.
// processBoxShadow/processFilter restore RN's JS parse. Two coverage paths: ARRAY form (color
// detection irrelevant) and STRING form (needs a realistic processColor classifying each arg).

import { afterAll, describe, expect, it } from 'vitest';
import { processBoxShadow } from './index';
import { processFilter } from '../process-filter';
import { setColorProcessor } from '../commit';

const PROCESSED_COLOR = 0x7f_b5_ff_d9;

// The string parser walks each whitespace arg and treats one as the color iff
// processColor(arg) != null, so the stub must reject "0px"/"22px" and accept rgba(...).
function installRealisticColorProcessor(): void {
  setColorProcessor(value => {
    if (typeof value === 'string' && /^(rgba?|hsla?|#)/i.test(value.trim())) return PROCESSED_COLOR;
    return null;
  });
}

// Reset so the identity processor (the engine default) is restored for any later test.
afterAll(() => {
  setColorProcessor(value => value);
});

describe('processBoxShadow', () => {
  describe('array form — identity processColor passes the color object through', () => {
    const [shadow] = processBoxShadow([
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 22,
        spreadDistance: 3,
        color: 'rgba(127,181,255,0.85)',
      },
    ]);

    it('keeps the offsets', () => {
      expect(shadow.offsetX).toBe(0);
      expect(shadow.offsetY).toBe(0);
    });

    it('keeps the blur and spread', () => {
      expect(shadow.blurRadius).toBe(22);
      expect(shadow.spreadDistance).toBe(3);
    });

    it('passes the color through untouched', () => {
      expect(shadow.color).toBe('rgba(127,181,255,0.85)');
    });
  });

  describe('string form — realistic processColor (null for lengths, int for colors)', () => {
    it('parses every component of a full shadow string', () => {
      installRealisticColorProcessor();
      const shadows = processBoxShadow('0px 0px 22px 3px rgba(127,181,255,0.85)');
      expect(shadows).toHaveLength(1);
      const [shadow] = shadows;
      expect(shadow.offsetX).toBe(0);
      expect(shadow.offsetY).toBe(0);
      expect(shadow.blurRadius).toBe(22);
      expect(shadow.spreadDistance).toBe(3);
      expect(shadow.color).toBe(PROCESSED_COLOR);
    });

    it('zeroes the whole list on an invalid primitive (web semantics: paint none)', () => {
      installRealisticColorProcessor();
      expect(processBoxShadow('5 0px red')).toHaveLength(0);
    });
  });
});

describe('processFilter', () => {
  it('passes a structured filter array through as the same primitive', () => {
    const filters = processFilter([{ brightness: 0.5 }]);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toHaveProperty('brightness', 0.5);
  });

  it('parses a filter string, applying _getFilterAmount per function', () => {
    installRealisticColorProcessor();
    const filters = processFilter('brightness(50%) hue-rotate(90deg)');
    expect(filters).toHaveLength(2);
    // 50% maps 1:1 to 0.5; hue-rotate camelizes to hueRotate with a degree number.
    expect(filters[0]).toHaveProperty('brightness', 0.5);
    expect(filters[1]).toHaveProperty('hueRotate', 90);
  });
});
