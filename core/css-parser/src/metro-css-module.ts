// Compiles a standalone .css/.scss/.sass/.less/.styl (and their .module.* twins) file into a
// plain JS module — the framework-agnostic twin of a Vue SFC's inline <style>/<style module>
// block (examples/vue-sfc/metro-vue-transformer.js), usable from ANY adapter's own source file:
// `import styles from './Card.module.scss'` works the same from a React .tsx, a Vue <script>, or
// an Angular .ts. See the symbiote-sfc-style-compiler skill.
//
// A plain style file registers its classes globally, exactly like an unscoped Vue <style>
// block — side-effect import only (`import './theme.scss'`), no default export. A `.module.*`
// file is ALWAYS scoped (that's the entire point of the extension): each class is suffixed with
// a hash of the file's own path (core/css-parser's fileScopeId, tagged `__module__` so it can
// never collide with a Vue <style scoped> block's plain `__<scopeId>` suffix even if the two
// ever shared a scope id), and the default export is a plain name->scopedName map, so
// `resolveClassName(styles.card)` (React `style={resolveClassName(styles.card)}`) or a template
// binding that hands the already-scoped string straight to resolveClassName's exact-match path
// both just work, no registry changes needed. `:global(.name)` opts a selector out of scoping,
// same as Vue's <style scoped>.
//
// A preprocessor source (SCSS/Sass/Less/Stylus) is reduced to plain CSS text via
// preprocessors.ts's `compile()` BEFORE any of the CSS-Modules scoping logic below runs — that
// logic is entirely language-agnostic, it only ever sees `parseCSS`'s plain-CSS output, same as
// it always did for a `.css` file.
import * as path from 'node:path';
import { parseCSS, type ICssParserOptions } from './parser.ts';
import { globalClassNamesIn } from './global-selectors.ts';
import { hashFilePath } from './file-scope-id.ts';
import { compile, detectLanguage } from './preprocessors.ts';

export interface ICompiledCssFile {
  code: string;
}

export function isCssModuleFile(filename: string): boolean {
  const ext = path.extname(filename);
  if (!ext) return false;
  return filename.slice(0, -ext.length).endsWith('.module');
}

// Preprocessing (SCSS/Less/Stylus → plain CSS text) is inherently async in Node — Less has no
// sync render API at all, and Stylus's callback-based render must be Promise-wrapped — so
// compileCssFile is async uniformly, even for a plain `.css` file that needs no preprocessing.
// See metro-transformer.ts for the fuller sync-vs-async writeup; the short version is that a
// sync fast-path for `.css` would fork this function into two shapes for a build-time-only,
// content-hash-cached call that is never a runtime hot path.
export async function compileCssFile(
  source: string,
  filename: string,
  options?: ICssParserOptions,
): Promise<ICompiledCssFile> {
  const lang = detectLanguage(filename);
  const css = lang === 'css' ? source : await compile(source, lang, filename);
  const parsed = parseCSS(css, { filename, ...options });

  if (!isCssModuleFile(filename)) {
    return {
      code: `import { registerStyles } from '@symbiote/engine';\nregisterStyles(${JSON.stringify(parsed)});\n`,
    };
  }

  const scopeId = hashFilePath(filename);
  // Scanned against the COMPILED css text, not the raw source: :global(...) isn't native SCSS/
  // Less/Stylus syntax (each preprocessor just passes an unrecognized selector through
  // unchanged), but scanning the compiler's actual output — rather than assuming source and
  // output stay textually identical for this token — is the one that can't drift under nesting/
  // interpolation.
  const exemptFromScope = globalClassNamesIn(css);
  const styles: Record<string, Record<string, unknown>> = {};
  const classMap: Record<string, string> = {};

  for (const [className, props] of Object.entries(parsed)) {
    const isExempt = exemptFromScope.has(className);
    const scopedName = isExempt ? className : `${className}__module__${scopeId}`;
    classMap[className] = scopedName;
    styles[scopedName] = props;
  }

  return {
    code:
      [
        `import { registerStyles } from '@symbiote/engine';`,
        `registerStyles(${JSON.stringify(styles)});`,
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n') + '\n',
  };
}
