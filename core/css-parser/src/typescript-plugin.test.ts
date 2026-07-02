// Exercises the plugin's actual host-override wiring against a fake tsserver host — real
// integration (does VS Code load it) can't be driven headlessly, but this proves getScriptSnapshot
// synthesizes the right literal-key .d.ts, the mtime-based cache invalidates on edit (the bug fixed
// vs wolf-tui's version), and camelCasing matches the runtime key parseCSS/generate-dts.ts produce.
// The plugin itself is hand-written CommonJS at the package root (../typescript-plugin.cjs, not
// under src/ — matches each adapter's metro-css-parser.cjs shim convention), so it's required here
// rather than imported as a typed module.
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import initPlugin from '../typescript-plugin.cjs';

type IFakeSnapshot = {
  getText(start: number, end: number): string;
  getLength(): number;
};

type IResolvedLiteral = { resolvedModule?: { resolvedFileName: string; extension: string } };
type IResolveModuleNameLiterals = (
  literals: ReadonlyArray<{ text: string }>,
  containingFile: string,
) => IResolvedLiteral[];

function makeFakeTypescript() {
  return {
    ScriptKind: { TS: 3, Unknown: 0 },
    Extension: { Dts: '.d.ts' },
    ScriptSnapshot: {
      fromString: (text: string): IFakeSnapshot => ({
        getText: (start: number, end: number) => text.slice(start, end),
        getLength: () => text.length,
      }),
    },
  };
}

function makeFakeInfo() {
  return {
    languageServiceHost: {
      readFile: (fileName: string) =>
        fs.existsSync(fileName) ? fs.readFileSync(fileName, 'utf8') : undefined,
      fileExists: (fileName: string) => fs.existsSync(fileName),
      getScriptSnapshot: (_fileName: string): IFakeSnapshot | undefined => undefined,
      getScriptKind: (_fileName: string) => 0,
      resolveModuleNameLiterals: undefined as IResolveModuleNameLiterals | undefined,
    },
    languageService: {},
  };
}

describe('typescript-plugin', () => {
  it('synthesizes a literal-key .d.ts (no index signature) for a .module.css file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }\n.section-tight { margin: 0; }');

    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const snapshot = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!snapshot) throw new Error('expected a snapshot for a .module.css file');
    const dts = snapshot.getText(0, snapshot.getLength());

    expect(dts).toContain('readonly card: string;');
    expect(dts).toContain('readonly sectionTight: string;');
    expect(dts).not.toContain('[key: string]');
  });

  it("invalidates its cache when the file changes on disk (mtime-keyed, unlike wolf-tui's sticky cache)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }');

    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const first = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!first) throw new Error('expected a snapshot for a .module.css file');
    expect(first.getText(0, first.getLength())).toContain('readonly card: string;');

    await new Promise(resolve => setTimeout(resolve, 10));
    fs.writeFileSync(cssPath, '.card { padding: 10px; }\n.title { color: red; }');

    const second = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!second) throw new Error('expected a snapshot for a .module.css file');
    expect(second.getText(0, second.getLength())).toContain('readonly title: string;');
  });

  it('resolves a relative .module.css import to itself as a .d.ts-kind module', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }');
    const containingFile = path.join(dir, 'index.ts').replace(/\\/g, '/');
    const cssPathPosix = cssPath.replace(/\\/g, '/');

    const info = makeFakeInfo();
    info.languageServiceHost.resolveModuleNameLiterals = vi.fn(() => [
      { resolvedModule: undefined },
    ]);

    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const literals = [{ text: './Card.module.css' }];
    const { resolveModuleNameLiterals } = info.languageServiceHost;
    if (!resolveModuleNameLiterals) throw new Error('expected the plugin to install a resolver');
    const result = resolveModuleNameLiterals(literals, containingFile);

    expect(result[0]?.resolvedModule?.resolvedFileName).toBe(cssPathPosix);
    expect(result[0]?.resolvedModule?.extension).toBe('.d.ts');
  });

  it('does not touch a non-.module.css file', () => {
    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    expect(info.languageServiceHost.getScriptKind('theme.css')).toBe(0);
  });
});
