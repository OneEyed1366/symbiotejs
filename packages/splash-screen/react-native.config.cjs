const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = '@symbiote-native/splash-screen';
const NATIVE_SPLASH_SCREEN_PACKAGE = 'react-native-bootsplash';

function findCliDependencyRoot() {
  let current = process.cwd();

  while (true) {
    const candidate = path.join(current, 'node_modules', ...PACKAGE_NAME.split('/'));
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return __dirname;
    }

    current = parent;
  }
}

const cliDependencyRoot = findCliDependencyRoot();
const nativeSplashScreenRoot = path.dirname(
  require.resolve(`${NATIVE_SPLASH_SCREEN_PACKAGE}/package.json`),
);

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: path.relative(cliDependencyRoot, path.join(nativeSplashScreenRoot, 'android')),
      },
      ios: {},
    },
  },
};
