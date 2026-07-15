// Co-located unit test: compileCssFile is the framework-agnostic twin of the Vue SFC
// transformer's inline <style>/<style module> handling — a plain .css file registers globally
// (no default export), a .module.css file always scopes its classes and exports a name->
// scopedName map any adapter can pass through resolveClassName.

import { describe, expect, it } from 'vitest';
import { compileCssFile, isCssModuleFile } from './index';

function extractRegisterStylesArg(code: string): Record<string, Record<string, unknown>> {
  const match = code.match(/registerStyles\((\{[\s\S]*?\})\);/);
  if (!match?.[1]) throw new Error('no registerStyles(...) call found in compiled output');
  return JSON.parse(match[1]) as Record<string, Record<string, unknown>>;
}

function extractDefaultExport(code: string): Record<string, string> {
  const match = code.match(/export default (\{[\s\S]*?\});/);
  if (!match?.[1]) throw new Error('no default export found in compiled output');
  return JSON.parse(match[1]) as Record<string, string>;
}

describe('isCssModuleFile', () => {
  it('recognizes the .module.css extension only', () => {
    expect(isCssModuleFile('Card.module.css')).toBe(true);
    expect(isCssModuleFile('Card.css')).toBe(false);
  });

  it('recognizes a .module.* preprocessor extension the same way', () => {
    expect(isCssModuleFile('Card.module.scss')).toBe(true);
    expect(isCssModuleFile('Card.module.sass')).toBe(true);
    expect(isCssModuleFile('Card.module.less')).toBe(true);
    expect(isCssModuleFile('Card.module.styl')).toBe(true);
    expect(isCssModuleFile('Card.scss')).toBe(false);
  });
});

describe('compileCssFile — plain .css', () => {
  it('registers classes globally with no default export', async () => {
    const { code } = await compileCssFile('.card { padding: 10px; }', 'theme.css');

    expect(code).toContain("from '@symbiote-native/engine'");
    expect(extractRegisterStylesArg(code)).toEqual({ card: { padding: 10 } });
    expect(code).not.toContain('export default');
  });
});

describe('compileCssFile — .module.css', () => {
  it('scopes every class and exports a name->scopedName map', async () => {
    const { code } = await compileCssFile('.card { padding: 10px; }', 'Card.module.css');
    const classMap = extractDefaultExport(code);

    expect(Object.keys(classMap)).toEqual(['card']);
    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
    expect(extractRegisterStylesArg(code)).toEqual({
      [classMap.card ?? '']: { padding: 10 },
    });
  });

  it('derives the same scope id for the same file path, a different one for a different path', async () => {
    const css = '.card { padding: 10px; }';
    const a1 = extractDefaultExport((await compileCssFile(css, 'Card.module.css')).code);
    const a2 = extractDefaultExport((await compileCssFile(css, 'Card.module.css')).code);
    const b = extractDefaultExport((await compileCssFile(css, 'Other.module.css')).code);

    expect(a1.card).toBe(a2.card);
    expect(a1.card).not.toBe(b.card);
  });

  it('does not scope a :global(...) selector', async () => {
    const { code } = await compileCssFile(':global(.reset) { margin: 0; }', 'Card.module.css');
    const classMap = extractDefaultExport(code);

    expect(classMap.reset).toBe('reset');
    expect(extractRegisterStylesArg(code)).toEqual({ reset: { margin: 0 } });
  });
});

describe('compileCssFile — standalone preprocessor files', () => {
  it('preprocesses a plain .scss file before registering it globally', async () => {
    const { code } = await compileCssFile('.card { .title { padding: 10px; } }', 'theme.scss');

    expect(extractRegisterStylesArg(code)).toEqual({ cardTitle: { padding: 10 } });
    expect(code).not.toContain('export default');
  });

  it('preprocesses a .module.scss file and scopes its classes', async () => {
    const { code } = await compileCssFile('.card { padding: 10px; }', 'Card.module.scss');
    const classMap = extractDefaultExport(code);

    expect(classMap.card).toMatch(/^card__module__[a-z0-9]+$/);
    expect(extractRegisterStylesArg(code)).toEqual({
      [classMap.card ?? '']: { padding: 10 },
    });
  });

  it('preprocesses a .less file', async () => {
    const { code } = await compileCssFile(
      '@spacing: 10px;\n.card { padding: @spacing; }',
      'theme.less',
    );
    expect(extractRegisterStylesArg(code)).toEqual({ card: { padding: 10 } });
  });

  it('preprocesses a .styl file', async () => {
    const { code } = await compileCssFile('.card\n  padding 10px\n', 'theme.styl');
    expect(extractRegisterStylesArg(code)).toEqual({ card: { padding: 10 } });
  });
});
