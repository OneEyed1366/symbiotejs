// react-native-bootsplash's package.json ships an `exports` map that only opens `.`,
// `./expo`, `./package.json`, `./app.plugin.js` — its internal TurboModule spec
// (dist/commonjs/specs/NativeRNBootSplash) is NOT a published subpath, so a deep import
// would throw ERR_PACKAGE_PATH_NOT_EXPORTED. getEnforcingNativeModule reads the same
// global TurboModule proxy the spec itself reads (by name), sidestepping the exports map
// entirely — this is how we reach getConstants(), which the package's public JS API
// (hide/isVisible/useHideAnimation) never exposes directly.
import { getEnforcingNativeModule } from '@symbiote-native/engine';
import type { IHideAnimationConstants } from './types';

const RN_BOOT_SPLASH_MODULE_NAME = 'RNBootSplash';

type IRNBootSplashSpec = {
  getConstants(): IHideAnimationConstants;
};

export function getHideAnimationConstants(): IHideAnimationConstants {
  return getEnforcingNativeModule<IRNBootSplashSpec>(RN_BOOT_SPLASH_MODULE_NAME).getConstants();
}
