// Unit-tests babel-register-composed.cjs directly against source strings shaped like real
// ngc --compilationMode partial output (see descriptor-to-angular/index.js:125 and
// create-animated-component.js for the real multi-selector case this mirrors) — no ngc/Metro
// involved, per the angular-adapter-build skill's Stage A/B split.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transformSync } from '@babel/core';
import plugin from './babel-register-composed.cjs';

// Mirrors metro-vue-transformer.test.ts's destructure-with-annotation pattern for a
// type-less .cjs import — no `as` cast needed.
const { PRIMITIVE_SELECTORS }: { PRIMITIVE_SELECTORS: Set<string> } = plugin;

function run(source: string): string {
  const result = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [plugin],
  });
  if (!result?.code) throw new Error('transformSync produced no code');
  return result.code;
}

const DESCRIPTOR_OUTLET_SNIPPET = `
import * as i0 from "@angular/core";
export class DescriptorOutlet {
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.5", ngImport: i0, type: DescriptorOutlet, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: DescriptorOutlet, isStandalone: true, selector: "symbiote-descriptor-outlet", inputs: { node: "node" }, usesOnChanges: true, ngImport: i0, template: '', isInline: true, changeDetection: i0.ChangeDetectionStrategy.OnPush });
}
`;

const MULTI_SELECTOR_SNIPPET = `
import * as i0 from "@angular/core";
export class AnimatedView {
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: AnimatedView, isStandalone: true, selector: "AnimatedView, symbiote-animated-view", inputs: {}, ngImport: i0, template: '', isInline: true });
}
`;

const PRIMITIVE_SNIPPET = `
import * as i0 from "@angular/core";
export class ViewHost {
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: ViewHost, isStandalone: true, selector: "symbiote-view", inputs: {}, ngImport: i0, template: '', isInline: true });
}
`;

const ALREADY_IMPORTED_SNIPPET = `
import { registerComposedComponent, other } from '@symbiote-native/angular';
import * as i0 from "@angular/core";
export class DescriptorOutlet {
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: DescriptorOutlet, isStandalone: true, selector: "symbiote-descriptor-outlet", inputs: {}, ngImport: i0, template: '', isInline: true });
}
`;

const NO_DECLARE_COMPONENT_SNIPPET = `
export function helper(x) {
  return x + 1;
}
`;

// Real shape of renderer.ts's compiled output: no @Component anywhere, defines
// registerComposedComponent itself. Confirms the plugin never rewrites its own definer.
const RENDERER_TS_SHAPE_SNIPPET = `
const ANCHOR_HOST_COMPONENTS = new Set(['ActivityIndicator']);
export function registerComposedComponent(selector) {
    ANCHOR_HOST_COMPONENTS.add(selector);
}
export class SymbioteRenderer {
    createElement(name) {
        return name;
    }
}
`;

// Babel's default generator emits double-quoted string literals — assertions match on
// substring content, not quote style, since this is intermediate machine output, not
// hand-authored source.
function importCountOf(code: string): number {
  return (code.match(/from ["']@symbiote-native\/angular["']/g) ?? []).length;
}

describe('babel-register-composed', () => {
  it('registers a single selector from a real ɵɵngDeclareComponent call', () => {
    const code = run(DESCRIPTOR_OUTLET_SNIPPET);
    expect(code).toMatch(
      /import \{ registerComposedComponent \} from ["']@symbiote-native\/angular["']/,
    );
    expect(code).toMatch(/registerComposedComponent\(["']symbiote-descriptor-outlet["']\)/);
  });

  it('registers each token of a comma-separated multi-selector', () => {
    const code = run(MULTI_SELECTOR_SNIPPET);
    expect(code).toMatch(/registerComposedComponent\(["']AnimatedView["']\)/);
    expect(code).toMatch(/registerComposedComponent\(["']symbiote-animated-view["']\)/);
  });

  it('does not register a real Fabric primitive selector', () => {
    const code = run(PRIMITIVE_SNIPPET);
    expect(code).not.toContain('registerComposedComponent');
    expect(importCountOf(code)).toBe(0);
  });

  it('does not duplicate an already-present registerComposedComponent import', () => {
    const code = run(ALREADY_IMPORTED_SNIPPET);
    expect(importCountOf(code)).toBe(1);
    expect(code).toMatch(/registerComposedComponent\(["']symbiote-descriptor-outlet["']\)/);
  });

  it('leaves a file with no ɵɵngDeclareComponent calls untouched', () => {
    const code = run(NO_DECLARE_COMPONENT_SNIPPET);
    expect(code.trim()).toBe(NO_DECLARE_COMPONENT_SNIPPET.trim());
  });

  it('leaves renderer.ts-shaped source (no @Component, defines the helper itself) untouched', () => {
    const code = run(RENDERER_TS_SHAPE_SNIPPET);
    expect(importCountOf(code)).toBe(0);
    // the file's own definition must stay the only occurrence — no self-import/call inserted
    expect(code.match(/registerComposedComponent/g)?.length).toBe(1);
  });
});

// Drift protection: the plugin can't `require()` a .ts source file (no transpile step for a
// plain Metro .cjs plugin), so PRIMITIVE_SELECTORS is a hardcoded literal mirroring
// ISymbioteIntrinsic (core/components/src/component-names/index.ios.ts). This test parses
// BOTH platform files' name tables by regex and fails loudly the moment a primitive is
// added/renamed there without the same edit landing here.
const COMPONENT_NAMES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../core/components/src/component-names',
);

function selectorsDeclaredIn(filename: string): Set<string> {
  const source = readFileSync(path.join(COMPONENT_NAMES_DIR, filename), 'utf8');
  const selectors = new Set<string>();
  for (const match of source.matchAll(/'(symbiote-[a-z-]+)':/g)) {
    const [, selector] = match;
    if (selector !== undefined) selectors.add(selector);
  }
  return selectors;
}

describe('babel-register-composed primitive-selector drift protection', () => {
  it('matches the exact union of symbiote-* selectors declared for iOS and Android', () => {
    const declared = new Set([
      ...selectorsDeclaredIn('index.ios.ts'),
      ...selectorsDeclaredIn('index.android.ts'),
    ]);
    expect(declared.size).toBeGreaterThan(0);
    expect(PRIMITIVE_SELECTORS).toEqual(declared);
  });
});
