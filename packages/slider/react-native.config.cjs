const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = '@symbiotejs/slider';
const NATIVE_SLIDER_PACKAGE = '@react-native-community/slider';

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
const nativeSliderRoot = path.dirname(require.resolve(`${NATIVE_SLIDER_PACKAGE}/package.json`));

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: path.relative(cliDependencyRoot, path.join(nativeSliderRoot, 'android')),
        libraryName: 'RNCSlider',
        componentDescriptors: ['RNCSliderComponentDescriptor'],
        cmakeListsPath: 'src/main/jni/CMakeLists.txt',
      },
      ios: {},
    },
  },
};
