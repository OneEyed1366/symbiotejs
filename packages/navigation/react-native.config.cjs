const fs = require('fs');
const path = require('path');

const PACKAGE_NAME = '@symbiote-native/navigation';
const NATIVE_SCREENS_PACKAGE = 'react-native-screens';

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
const nativeScreensRoot = path.dirname(require.resolve(`${NATIVE_SCREENS_PACKAGE}/package.json`));

module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: path.relative(cliDependencyRoot, path.join(nativeScreensRoot, 'android')),
        libraryName: 'rnscreens',
        componentDescriptors: [
          'RNSFullWindowOverlayComponentDescriptor',
          'RNSScreenContainerComponentDescriptor',
          'RNSScreenNavigationContainerComponentDescriptor',
          'RNSScreenStackHeaderConfigComponentDescriptor',
          'RNSScreenStackHeaderSubviewComponentDescriptor',
          'RNSScreenStackComponentDescriptor',
          'RNSSearchBarComponentDescriptor',
          'RNSScreenComponentDescriptor',
          'RNSScreenFooterComponentDescriptor',
          'RNSScreenContentWrapperComponentDescriptor',
          'RNSModalScreenComponentDescriptor',
          'RNSTabsHostComponentDescriptor',
          'RNSSafeAreaViewComponentDescriptor',
          'RNSStackScreenComponentDescriptor',
          'RNSStackHeaderConfigComponentDescriptor',
          'RNSStackHeaderSubviewComponentDescriptor',
          'RNSFormSheetHostComponentDescriptor',
        ],
        cmakeListsPath: 'src/main/jni/CMakeLists.txt',
      },
      ios: {},
    },
  },
};
