// Co-located unit test (ADR 0025): experimental_backgroundImage is JS-parsed before Fabric, same
// root cause as boxShadow/transform/filter (enableNativeCSSParsing defaults false). Two coverage
// paths: STRING form (the CSS gradient syntax authors actually write) and ARRAY form (the
// structured/animated hot path, color detection irrelevant there).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processBackgroundImage } from './index';
import { setColorProcessor } from '../commit';

const PROCESSED_COLOR = 0x7f_b5_ff_d9;

function installRealisticColorProcessor(): void {
  setColorProcessor(value => {
    if (typeof value === 'string' && /^(rgba?|hsla?|#|red|blue|green)/i.test(value.trim())) {
      return PROCESSED_COLOR;
    }
    return null;
  });
}

afterAll(() => {
  setColorProcessor(value => value);
});

describe('processBackgroundImage', () => {
  describe('linear-gradient string form', () => {
    it('defaults direction to "to bottom" (180deg) when omitted', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(red, blue)');
      expect(gradient?.type).toBe('linear-gradient');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.direction).toEqual({ type: 'angle', value: 180 });
      expect(gradient.colorStops).toEqual([
        { color: PROCESSED_COLOR, position: null },
        { color: PROCESSED_COLOR, position: null },
      ]);
    });

    it('parses an angle direction with a unit', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(45deg, red, blue)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.direction).toEqual({ type: 'angle', value: 45 });
    });

    it('converts grad/rad/turn units to degrees', () => {
      installRealisticColorProcessor();
      const [grad] = processBackgroundImage('linear-gradient(100grad, red, blue)');
      const [rad] = processBackgroundImage('linear-gradient(3.14159265rad, red, blue)');
      const [turn] = processBackgroundImage('linear-gradient(0.5turn, red, blue)');
      if (
        grad?.type !== 'linear-gradient' ||
        rad?.type !== 'linear-gradient' ||
        turn?.type !== 'linear-gradient'
      ) {
        throw new Error('expected linear-gradient');
      }
      expect(grad.direction.value).toBeCloseTo(90);
      expect(rad.direction.value).toBeCloseTo(180, 1);
      expect(turn.direction.value).toBe(180);
    });

    it('parses a keyword direction', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(to right, red, blue)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.direction).toEqual({ type: 'angle', value: 90 });
    });

    it('parses a diagonal keyword direction to the keyword form', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(to top right, red, blue)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.direction).toEqual({ type: 'keyword', value: 'to top right' });
    });

    it('parses percentage color-stop positions', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(red 0%, blue 100%)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.colorStops).toEqual([
        { color: PROCESSED_COLOR, position: '0%' },
        { color: PROCESSED_COLOR, position: '100%' },
      ]);
    });

    it('expands a double-position color stop into two stops', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(red 0% 50%, blue 100%)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.colorStops).toEqual([
        { color: PROCESSED_COLOR, position: '0%' },
        { color: PROCESSED_COLOR, position: '50%' },
        { color: PROCESSED_COLOR, position: '100%' },
      ]);
    });

    it('parses the transition-hint syntax (color, position, color)', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(red, 20%, blue)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.colorStops).toEqual([
        { color: PROCESSED_COLOR, position: null },
        { color: null, position: '20%' },
        { color: PROCESSED_COLOR, position: null },
      ]);
    });

    it('rejects a transition hint as the first or last stop', () => {
      installRealisticColorProcessor();
      expect(processBackgroundImage('linear-gradient(20%, red, blue)')).toEqual([]);
      expect(processBackgroundImage('linear-gradient(red, blue, 20%)')).toEqual([]);
    });

    it('does not let an internal rgba() comma break color-stop splitting', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('linear-gradient(rgba(0, 0, 0, .5), blue)');
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.colorStops).toHaveLength(2);
    });

    it('parses multiple comma-separated gradients as separate layers', () => {
      installRealisticColorProcessor();
      const gradients = processBackgroundImage(
        'linear-gradient(red, blue), linear-gradient(to right, green, red)',
      );
      expect(gradients).toHaveLength(2);
    });

    it('returns an empty array for an invalid angle', () => {
      installRealisticColorProcessor();
      expect(processBackgroundImage('linear-gradient(45xyz, red, blue)')).toEqual([]);
    });
  });

  describe('radial-gradient string form', () => {
    it('defaults to ellipse/farthest-corner/center when unspecified', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('radial-gradient(red, blue)');
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.shape).toBe('ellipse');
      expect(gradient.size).toBe('farthest-corner');
      expect(gradient.position).toEqual({ top: '50%', left: '50%' });
    });

    it('parses an explicit shape and size keyword', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('radial-gradient(circle closest-side, red, blue)');
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.shape).toBe('circle');
      expect(gradient.size).toBe('closest-side');
    });

    it('defaults an explicit single-length size to a circle shape', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('radial-gradient(20px, red, blue)');
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.shape).toBe('circle');
      expect(gradient.size).toEqual({ x: 20, y: 20 });
    });

    it('parses an explicit two-length size', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('radial-gradient(20px 30px, red, blue)');
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.size).toEqual({ x: 20, y: 30 });
    });

    it('rejects an ellipse explicitly paired with a single explicit size', () => {
      installRealisticColorProcessor();
      expect(processBackgroundImage('radial-gradient(ellipse 20px, red, blue)')).toEqual([]);
    });

    it('parses "at <keyword position>" (2-keyword form resolves via the left/top keys — "right" is expressed as left: 100%, matching RN)', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('radial-gradient(at top right, red, blue)');
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.position).toEqual({ top: '0%', left: '100%' });
    });

    it('parses "at <length-percentage> <length-percentage>"', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage('radial-gradient(at 25% 75%, red, blue)');
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.position).toEqual({ top: '75%', left: '25%' });
    });

    it('parses shape + size + position together', () => {
      installRealisticColorProcessor();
      const [gradient] = processBackgroundImage(
        'radial-gradient(circle farthest-side at left top, red, blue)',
      );
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.shape).toBe('circle');
      expect(gradient.size).toBe('farthest-side');
      expect(gradient.position).toEqual({ top: '0%', left: '0%' });
    });
  });

  describe('array form — identity color processor passes colors through', () => {
    // Runs after the string-form tests above, which install a "realistic" color processor —
    // reset to identity so these assertions don't depend on file execution order.
    beforeAll(() => {
      setColorProcessor(value => value);
    });

    it('parses a linear-gradient with a raw string direction', () => {
      const [gradient] = processBackgroundImage([
        {
          type: 'linear-gradient',
          direction: '45deg',
          colorStops: [{ color: 'red', positions: undefined }, { color: 'blue' }],
        },
      ]);
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.direction).toEqual({ type: 'angle', value: 45 });
      expect(gradient.colorStops).toEqual([
        { color: 'red', position: null },
        { color: 'blue', position: null },
      ]);
    });

    it('expands a multi-position color stop', () => {
      const [gradient] = processBackgroundImage([
        {
          type: 'linear-gradient',
          colorStops: [
            { color: 'red', positions: ['0%', '50%'] },
            { color: 'blue', positions: ['100%'] },
          ],
        },
      ]);
      if (gradient?.type !== 'linear-gradient') throw new Error('expected linear-gradient');
      expect(gradient.colorStops).toEqual([
        { color: 'red', position: '0%' },
        { color: 'red', position: '50%' },
        { color: 'blue', position: '100%' },
      ]);
    });

    it('parses a radial-gradient with a structured position', () => {
      const [gradient] = processBackgroundImage([
        {
          type: 'radial-gradient',
          shape: 'circle',
          size: 'closest-side',
          position: { bottom: '10%', right: '20%' },
          colorStops: [{ color: 'red' }, { color: 'blue' }],
        },
      ]);
      if (gradient?.type !== 'radial-gradient') throw new Error('expected radial-gradient');
      expect(gradient.shape).toBe('circle');
      expect(gradient.size).toBe('closest-side');
      expect(gradient.position).toEqual({ bottom: '10%', right: '20%' });
    });

    it('zeroes the whole list on an invalid color stop (web semantics: paint none)', () => {
      expect(
        processBackgroundImage([{ type: 'linear-gradient', colorStops: [{ color: null }] }]),
      ).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('returns an empty array for undefined input', () => {
      expect(processBackgroundImage(undefined)).toEqual([]);
    });

    it('returns an empty array for an unrecognized string', () => {
      expect(processBackgroundImage('none')).toEqual([]);
    });
  });
});
