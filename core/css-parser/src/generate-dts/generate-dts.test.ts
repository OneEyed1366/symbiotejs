// Co-located unit test for the .d.ts generator (see generate-dts.ts's file-header comment for
// why this exists). The key thing under test is the ABSENCE of an index signature: unlike Volar's
// `Record<string, string> & {known keys}` for inline `<style module>` blocks, an unknown key
// here must not type-check at all.

import { describe, expect, it } from 'vitest';
import { classNamesToDtsSource, generateModuleDts } from './index';

describe('classNamesToDtsSource', () => {
  it('emits a readonly literal-key type with no index signature', () => {
    const dts = classNamesToDtsSource(['card', 'title']);

    expect(dts).toContain('readonly card: string;');
    expect(dts).toContain('readonly title: string;');
    expect(dts).not.toMatch(/\[key: string\]/);
    expect(dts).not.toContain('Record<string, string>');
  });

  it('quotes a class name that is not a valid identifier', () => {
    const dts = classNamesToDtsSource(['section-tight']);

    expect(dts).toContain(`readonly "section-tight": string;`);
  });

  it('sorts keys for a stable diff', () => {
    const dts = classNamesToDtsSource(['zebra', 'apple']);
    const appleIndex = dts.indexOf('apple');
    const zebraIndex = dts.indexOf('zebra');

    expect(appleIndex).toBeLessThan(zebraIndex);
  });

  it('produces an empty (but valid) object type for no classes', () => {
    const dts = classNamesToDtsSource([]);

    expect(dts).toContain('declare const styles: {\n\n};');
  });
});

describe('generateModuleDts', () => {
  it('returns null for a plain (non-module) style file', async () => {
    const dts = await generateModuleDts('.card { padding: 10px; }', 'theme.css');

    expect(dts).toBeNull();
  });

  it('generates a .d.ts for a .module.css file, keyed by the ORIGINAL class name', async () => {
    const dts = await generateModuleDts('.card { padding: 10px; }', 'Card.module.css');

    expect(dts).toContain('readonly card: string;');
    expect(dts).not.toContain('__module__');
  });

  it('preprocesses a .module.scss file the same way', async () => {
    const dts = await generateModuleDts('.card { .title { padding: 10px; } }', 'Card.module.scss');

    expect(dts).toContain('readonly cardTitle: string;');
  });

  it('excludes a :global(...) selector the same way compileCssFile does', async () => {
    const dts = await generateModuleDts(':global(.reset) { margin: 0; }', 'Card.module.css');

    expect(dts).toContain('readonly reset: string;');
  });
});
