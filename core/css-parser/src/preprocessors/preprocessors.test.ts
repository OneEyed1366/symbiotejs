// Unit test for the SCSS/Sass, Less, and Stylus preprocessor layer. Each "real
// compile" case below drives the ACTUAL installed sass/less/stylus package (all three are
// devDependencies of this package, see package.json) rather than a mock, on purpose — a
// hand-ported mock of the compiler's output can pass while silently diverging from the real
// compiler's semantics (a pseudo-class edge case slipped through exactly that way once), so
// nesting/variables/mixins are verified against the real compiler output, then through the
// real (unmodified) parseCSS.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parseCSS } from '../parser/index.ts';
import {
  compileScss,
  compileSass,
  compileLess,
  compileStylus,
  compile,
  detectLanguage,
  isStyleFile,
} from './index';

describe('detectLanguage', () => {
  it('maps each recognized extension to its preprocessor language', () => {
    expect(detectLanguage('theme.css')).toBe('css');
    expect(detectLanguage('theme.scss')).toBe('scss');
    expect(detectLanguage('theme.sass')).toBe('scss');
    expect(detectLanguage('theme.less')).toBe('less');
    expect(detectLanguage('theme.styl')).toBe('stylus');
    expect(detectLanguage('theme.stylus')).toBe('stylus');
  });

  it('falls back to css for an unrecognized extension', () => {
    expect(detectLanguage('theme.txt')).toBe('css');
  });
});

describe('isStyleFile', () => {
  it('recognizes every preprocessor extension plus plain css', () => {
    for (const filename of ['a.css', 'a.scss', 'a.sass', 'a.less', 'a.styl', 'a.stylus']) {
      expect(isStyleFile(filename)).toBe(true);
    }
  });

  it('rejects a non-style extension', () => {
    expect(isStyleFile('App.tsx')).toBe(false);
  });
});

describe('compileScss — nesting, variables, a mixin', () => {
  const SCSS_SOURCE = `
$primary: red;
$spacing: 10px;

@mixin padded($amount) {
  padding: $amount;
}

.card {
  @include padded($spacing);
  color: $primary;

  .title {
    font-weight: bold;
  }

  &.active {
    opacity: 1;
  }
}
`;

  it('compiles nesting, a variable, and a mixin down to plain CSS parseCSS can read', async () => {
    const css = await compileScss(SCSS_SOURCE, 'Card.scss');
    expect(css).toContain('.card');
    expect(css).toContain('color: red');

    const styles = parseCSS(css, { filename: 'Card.scss' });
    expect(styles.card).toEqual({ padding: 10, color: 'red' });
    expect(styles.cardTitle).toEqual({ fontWeight: 'bold' });
    expect(styles.cardActive).toEqual({ opacity: 1 });
  });

  it('routes the indented syntax through .sass by file extension', async () => {
    const SASS_SOURCE = '.card\n  padding: 10px\n  color: red\n';
    const css = await compileSass(SASS_SOURCE, 'Card.sass');
    const styles = parseCSS(css, { filename: 'Card.sass' });
    expect(styles.card).toEqual({ padding: 10, color: 'red' });
  });
});

describe('compileLess — nesting, variables, a mixin', () => {
  const LESS_SOURCE = `
@primary: red;
@spacing: 10px;

.padded(@amount) {
  padding: @amount;
}

.card {
  .padded(@spacing);
  color: @primary;

  .title {
    font-weight: bold;
  }

  &.active {
    opacity: 1;
  }
}
`;

  it('compiles nesting, a variable, and a mixin down to plain CSS parseCSS can read', async () => {
    const css = await compileLess(LESS_SOURCE, 'Card.less');
    const styles = parseCSS(css, { filename: 'Card.less' });

    expect(styles.card).toEqual({ padding: 10, color: 'red' });
    expect(styles.cardTitle).toEqual({ fontWeight: 'bold' });
    expect(styles.cardActive).toEqual({ opacity: 1 });
  });
});

describe('compileStylus — nesting, variables, a function', () => {
  const STYLUS_SOURCE = [
    'primary = red',
    'spacing = 10px',
    '',
    'padded(amount)',
    '  padding amount',
    '',
    '.card',
    '  padded(spacing)',
    '  color primary',
    '',
    '  .title',
    '    font-weight bold',
    '',
    '  &.active',
    '    opacity 1',
    '',
  ].join('\n');

  it('compiles nesting, a bare-assignment variable, and a function down to plain CSS parseCSS can read', async () => {
    const css = await compileStylus(STYLUS_SOURCE, 'Card.styl');
    const styles = parseCSS(css, { filename: 'Card.styl' });

    // Stylus canonicalizes a named color to its hex shorthand at compile time (`red` -> `#f00`)
    // — a real divergence from SCSS/Less, which both leave `red` as-is; RN accepts both forms.
    expect(styles.card).toEqual({ padding: 10, color: '#f00' });
    expect(styles.cardTitle).toEqual({ fontWeight: 'bold' });
    expect(styles.cardActive).toEqual({ opacity: 1 });
  });
});

describe('compile — unified entry point', () => {
  it('passes plain CSS through unchanged', async () => {
    const css = await compile('.card { padding: 10px; }', 'css');
    expect(css).toBe('.card { padding: 10px; }');
  });

  it('dispatches to the right compiler for each language', async () => {
    expect(await compile('.card { padding: 10px; }', 'scss', 'Card.scss')).toContain('padding');
    expect(await compile('.card { padding: 10px; }', 'less', 'Card.less')).toContain('padding');
    expect(await compile('.card\n  padding 10px\n', 'stylus', 'Card.styl')).toContain('padding');
  });
});

describe('missing-package errors', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws an install hint when sass is not installed', async () => {
    vi.doMock('sass', () => {
      throw new Error("Cannot find module 'sass'");
    });
    const { compileScss: compileScssFresh } = await import('./index');
    await expect(compileScssFresh('.card { padding: 10px; }')).rejects.toThrow(
      /sass is required for \.scss\/\.sass files\. Install it: npm i -D sass/,
    );
  });

  it('throws an install hint when less is not installed', async () => {
    vi.doMock('less', () => {
      throw new Error("Cannot find module 'less'");
    });
    const { compileLess: compileLessFresh } = await import('./index');
    await expect(compileLessFresh('.card { padding: 10px; }')).rejects.toThrow(
      /less is required for \.less files\. Install it: npm i -D less/,
    );
  });

  it('throws an install hint when stylus is not installed', async () => {
    vi.doMock('stylus', () => {
      throw new Error("Cannot find module 'stylus'");
    });
    const { compileStylus: compileStylusFresh } = await import('./index');
    await expect(compileStylusFresh('.card\n  padding 10px\n')).rejects.toThrow(
      /stylus is required for \.styl files\. Install it: npm i -D stylus/,
    );
  });
});
