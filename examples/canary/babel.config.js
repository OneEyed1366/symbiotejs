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

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [inlineDebugFlag],
};
