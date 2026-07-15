// Co-located unit test: parseCSS compiles a plain CSS string into a
// `{ className: RNStyleObject }` map, mapping CSS properties and values onto their
// React Native style prop names and values.

import { describe, expect, it, vi } from 'vitest';
import { parseCSS } from './index';

describe('parseCSS', () => {
  it('maps a single class selector', () => {
    expect(parseCSS('.card { color: red }')).toEqual({
      card: { color: 'red' },
    });
  });

  it('converts kebab-case properties and kebab-case class names to camelCase', () => {
    expect(parseCSS('.btn-primary { background-color: blue }')).toEqual({
      btnPrimary: { backgroundColor: 'blue' },
    });
  });

  it('maps aspect-ratio to a plain number, unlike transform/shadow it has no shape mismatch', () => {
    expect(parseCSS('.thumbnail { aspect-ratio: 1.5 }')).toEqual({
      thumbnail: { aspectRatio: 1.5 },
    });
  });

  it('flattens a compound selector into one camelCase class name', () => {
    expect(parseCSS('.btn.primary { font-weight: bold }')).toEqual({
      btnPrimary: { fontWeight: 'bold' },
    });
  });

  it('flattens a descendant selector into one camelCase class name', () => {
    expect(parseCSS('.card .title { color: red }')).toEqual({
      cardTitle: { color: 'red' },
    });
  });

  it('converts a px value to a plain number', () => {
    expect(parseCSS('.box { padding: 10px }')).toEqual({
      box: { padding: 10 },
    });
  });

  it('keeps a percentage value as a string', () => {
    expect(parseCSS('.box { width: 50% }')).toEqual({
      box: { width: '50%' },
    });
  });

  it('maps gap and its row/column variants', () => {
    expect(parseCSS('.box { gap: 12px; row-gap: 4px; column-gap: 8px }')).toEqual({
      box: { gap: 12, rowGap: 4, columnGap: 8 },
    });
  });

  it('resolves a var() reference declared in :root', () => {
    const css = `
      :root { --primary-color: teal; }
      .card { color: var(--primary-color); }
    `;
    expect(parseCSS(css)).toEqual({
      card: { color: 'teal' },
    });
  });

  it('evaluates a calc() multiplication', () => {
    expect(parseCSS('.box { margin-top: calc(2 * 10px) }')).toEqual({
      box: { marginTop: 20 },
    });
  });

  it('drops an unsupported property without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => parseCSS('.card { animation: spin 1s linear; color: red }')).not.toThrow();
    expect(parseCSS('.card { animation: spin 1s linear; color: red }')).toEqual({
      card: { color: 'red' },
    });
    expect(warn).toHaveBeenCalledWith(
      '[@symbiote-native/css-parser] unsupported CSS property "animation" dropped',
    );

    warn.mockRestore();
  });

  it('warns once per unique unsupported property per parseCSS() call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    parseCSS('.a { animation: none; } .b { animation: none; }');
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  // `transform`/`box-shadow` are passed through as raw, UNPARSED CSS text — RN's own JS
  // pre-processors (core/engine/src/process-transform, core/engine/src/process-box-shadow)
  // parse this exact syntax at commit time, including matrix()/inset/spread/multi-shadow lists,
  // so css-parser's only job is the kebab→camel rename, not a value transform.
  it('passes transform through untouched as raw CSS text, just renamed to camelCase', () => {
    expect(parseCSS('.box { transform: translateX(10px) rotate(45deg) scale(1.5) }')).toEqual({
      box: { transform: 'translateX(10px) rotate(45deg) scale(1.5)' },
    });
  });

  it('passes box-shadow through untouched as raw CSS text, just renamed to camelCase', () => {
    expect(parseCSS('.card { box-shadow: inset 0 2px 4px 6px rgba(0, 0, 0, 0.3) }')).toEqual({
      card: { boxShadow: 'inset 0 2px 4px 6px rgba(0, 0, 0, 0.3)' },
    });
  });

  // Same raw-passthrough reasoning as transform/box-shadow above: core/engine/src/process-filter,
  // process-transform-origin, and process-background-image already parse these exact CSS
  // syntaxes at commit time, ported from RN's own JS processors.
  it('passes filter through untouched as raw CSS text, just renamed to camelCase', () => {
    expect(parseCSS('.card { filter: brightness(0.5) blur(4px) }')).toEqual({
      card: { filter: 'brightness(0.5) blur(4px)' },
    });
  });

  it('passes transform-origin through untouched as raw CSS text, renamed to camelCase', () => {
    expect(parseCSS('.box { transform-origin: top left }')).toEqual({
      box: { transformOrigin: 'top left' },
    });
  });

  // RN's own style prop is `experimental_backgroundImage`, not a plain camelCase rename of the
  // CSS property — see the PROPERTY_TABLE comment.
  it('passes background-image through untouched as raw CSS text, renamed to experimental_backgroundImage', () => {
    expect(parseCSS('.card { background-image: linear-gradient(to right, red, blue) }')).toEqual({
      card: { experimental_backgroundImage: 'linear-gradient(to right, red, blue)' },
    });
  });

  it('maps text-shadow to RN text shadow props', () => {
    expect(parseCSS('.title { text-shadow: 1px 1px 2px black }')).toEqual({
      title: {
        textShadowColor: 'black',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
      },
    });
  });

  it('contributes nothing for a pseudo-class rule', () => {
    expect(parseCSS(':hover { color: red }')).toEqual({});
  });

  it('contributes nothing for a bare element selector', () => {
    expect(parseCSS('div { color: red }')).toEqual({});
  });

  it('drops the whole rule for a pseudo-class trailing a class selector, without leaking into the base class', () => {
    expect(parseCSS('.card { padding: 10px } .card:hover { padding: 20px; opacity: 0.5 }')).toEqual(
      {
        card: { padding: 10 },
      },
    );
  });

  it('unwraps a :global(...) selector to its inner class name', () => {
    expect(parseCSS(':global(.reset) { margin: 0 }')).toEqual({
      reset: { margin: 0 },
    });
  });

  it('unwraps a :global(...) compound selector', () => {
    expect(parseCSS(':global(.btn.primary) { font-weight: bold }')).toEqual({
      btnPrimary: { fontWeight: 'bold' },
    });
  });

  it('skips @media at-rules with a warning instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const css = `
      @media (min-width: 600px) {
        .card { color: red; }
      }
      .title { color: blue; }
    `;
    expect(parseCSS(css)).toEqual({
      title: { color: 'blue' },
    });
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('returns an empty object for empty input', () => {
    expect(parseCSS('')).toEqual({});
  });
});
