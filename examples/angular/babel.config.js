// Inline `process.env.DEBUG` at bundle time so @symbiote diagnostic logs can be toggled
// from the shell:
//   DEBUG=1 pnpm start --reset-cache
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
  plugins: [
    // Must run BEFORE the linker below: reads `selector` off the still-partial
    // ɵɵngDeclareComponent(...) shape and auto-calls registerComposedComponent for every
    // composed component in the bundle — see the angular-adapter-build skill.
    require('@symbiote-native/angular/babel-register-composed'),
    // Stage B of Angular AOT: Metro sees the partial-Ivy JS emitted by `pnpm ng:build`;
    // @symbiote-native/angular's linker turns every ɵɵngDeclareComponent into full Ivy before
    // Hermes sees it.
    require('@symbiote-native/angular/babel-linker'),
    inlineDebugFlag,
  ],
};
