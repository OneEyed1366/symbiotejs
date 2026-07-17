// Auto-registers ANCHOR_HOST_COMPONENTS from compiled @Component metadata, replacing
// hand-written registerComposedComponent(...) calls (see the angular-adapter skill §11).
// Runs in the SAME Babel pass as babel-linker.cjs, BEFORE it — Stage A (ngc --compilationMode
// partial) emits ɵɵngDeclareComponent({..., selector}) calls; the linker only turns those into
// full Ivy afterwards, so this plugin must see the simpler pre-link shape (see
// angular-adapter-build skill §1).
//
// Primitive selectors are hardcoded here (not required from the .ts source — this is a plain
// .cjs Babel plugin Metro loads via a raw require(), no transpile step available) — source of
// truth: core/components/src/component-names/index.ios.ts's ISymbioteIntrinsic union. Kept in
// sync by the drift-protection test in babel-register-composed.test.ts.
const PRIMITIVE_SELECTORS = new Set([
  'symbiote-view',
  'symbiote-text',
  'symbiote-image',
  'symbiote-scroll-view',
  'symbiote-scroll-content',
  'symbiote-horizontal-scroll-view',
  'symbiote-horizontal-scroll-content',
  'symbiote-text-input',
  'symbiote-text-input-multiline',
  'symbiote-switch',
  'symbiote-activity-indicator',
  'symbiote-safe-area-view',
  'symbiote-modal',
  'symbiote-refresh-control',
  'symbiote-input-accessory-view',
]);

// Inject from the package barrel — the ONE resolution route every consumer already uses, so the
// leaf's registry Set stays a single module instance. `registerComposedComponent` is re-exported
// from the barrel straight off the dependency-free leaf `anchor-host-registry.ts`, so importing it
// here does NOT drag in the cyclic renderer graph, yet resolves to the same leaf Set that
// `createElement` reads. (An earlier attempt injected a dedicated `.../anchor-host-registry`
// subpath instead; under pnpm symlinks that gave the leaf a SECOND resolved path — a second Set —
// so navigation-package registrations and createElement's lookup desynced. See the leaf header +
// angular-adapter §11c.)
const IMPORT_SOURCE = '@symbiote-native/angular';
const HELPER_NAME = 'registerComposedComponent';

function isNgDeclareComponentCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'ɵɵngDeclareComponent'
  );
}

function selectorPropertyOf(objectExpression) {
  return objectExpression.properties.find(
    prop =>
      prop.type === 'ObjectProperty' &&
      !prop.computed &&
      ((prop.key.type === 'Identifier' && prop.key.name === 'selector') ||
        (prop.key.type === 'StringLiteral' && prop.key.value === 'selector')),
  );
}

function composedSelectorsFromCall(node) {
  const [arg] = node.arguments;
  if (!arg || arg.type !== 'ObjectExpression') return [];
  const selectorProp = selectorPropertyOf(arg);
  if (!selectorProp || selectorProp.value.type !== 'StringLiteral') return [];
  return selectorProp.value.value
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0 && !PRIMITIVE_SELECTORS.has(token));
}

function hasComposedImport(programNode) {
  return programNode.body.some(
    node =>
      node.type === 'ImportDeclaration' &&
      node.source.value === IMPORT_SOURCE &&
      node.specifiers.some(
        spec =>
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === HELPER_NAME,
      ),
  );
}

// Exposed as a property on the plugin function (not a separate export) so Babel still loads
// this file as a plain plugin factory; babel-register-composed.test.ts's drift-protection test
// reads it to compare against core/components/src/component-names/index.{ios,android}.ts.
module.exports = function registerComposedPlugin({ types: t }) {
  return {
    name: 'symbiote-register-composed',
    visitor: {
      Program(programPath) {
        const selectors = new Set();
        programPath.traverse({
          CallExpression(path) {
            if (isNgDeclareComponentCall(path.node)) {
              for (const selector of composedSelectorsFromCall(path.node)) selectors.add(selector);
            }
          },
        });
        if (selectors.size === 0) return;

        const statements = [...selectors].map(selector =>
          t.expressionStatement(
            t.callExpression(t.identifier(HELPER_NAME), [t.stringLiteral(selector)]),
          ),
        );

        if (!hasComposedImport(programPath.node)) {
          statements.unshift(
            t.importDeclaration(
              [t.importSpecifier(t.identifier(HELPER_NAME), t.identifier(HELPER_NAME))],
              t.stringLiteral(IMPORT_SOURCE),
            ),
          );
        }

        // Import hoisting makes textual position irrelevant to `registerComposedComponent`'s
        // availability, so unshifting the whole batch to the top keeps this single-pass.
        programPath.unshiftContainer('body', statements);
      },
    },
  };
};

module.exports.PRIMITIVE_SELECTORS = PRIMITIVE_SELECTORS;
