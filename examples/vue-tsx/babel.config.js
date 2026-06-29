// Inline `process.env.DEBUG` at bundle time so the @symbiote diagnostic logs can
// be toggled from the shell without a dependency:
//   DEBUG=1 npx react-native start --reset-cache
// The value is read from Metro's own environment when this config is evaluated
// and baked into every transformed module (the app entry and the shared source).
const debugFlag = process.env.DEBUG === '1' ? '1' : '0';

function inlineDebugFlag({ types: t }) {
  return {
    name: 'inline-debug-flag',
    visitor: {
      MemberExpression(path) {
        if (path.matchesPattern('process.env.DEBUG')) {
          path.replaceWith(t.stringLiteral(debugFlag));
        }
      },
    },
  };
}

// The RN preset's dev React-JSX transform injects __self={this} and __source={...} on every
// JSXElement. Under React they are inert dev annotations, but @vue/babel-plugin-jsx copies them
// verbatim into the Vue vnode's PROPS — and at module scope `this` is the Hermes global HostObject.
// Any Vue dev warn then formats that prop for its component trace, the formatter reads
// Symbol.toStringTag off the HostObject, that throws, and the throw unwinds the whole mount → blank
// screen. Strip both attributes on JSXOpeningElement exit: the self/source plugins add them on enter
// (so they exist by exit), and the Vue plugin reads attributes on JSXElement exit, which fires after
// this child-level exit — so the props never carry them.
function stripReactJsxDevAttrs() {
  const DEV_ATTRS = new Set(['__self', '__source']);
  return {
    name: 'strip-react-jsx-dev-attrs',
    visitor: {
      JSXOpeningElement: {
        exit(path) {
          path.node.attributes = path.node.attributes.filter(
            attr =>
              !(
                attr.type === 'JSXAttribute' &&
                attr.name.type === 'JSXIdentifier' &&
                DEV_ATTRS.has(attr.name.name)
              ),
          );
        },
      },
    },
  };
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // @vue/babel-plugin-jsx is listed FIRST so it runs before the RN preset's React-JSX
  // transform: babel applies `plugins` before `presets`, so the Vue plugin rewrites every
  // JSXElement into a @vue/runtime-core createVNode call, leaving no JSX for the React
  // transform to touch (it no-ops). The helper imports it injects come `from 'vue'`, which
  // metro.config.js aliases to @vue/runtime-core, the one Vue runtime the adapter renders on.
  plugins: ['@vue/babel-plugin-jsx', stripReactJsxDevAttrs, inlineDebugFlag],
};
