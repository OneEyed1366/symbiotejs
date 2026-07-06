import { Platform } from '@symbiote-native/engine';
import { isEdgeToEdge } from 'react-native-is-edge-to-edge';
import type { HideAnimationController } from './hide-animation-controller';
import type {
  IHideAnimationConfig,
  IHideAnimationConstants,
  IHideAnimationImageProps,
  IHideAnimationResult,
} from './types';

// react-native-bootsplash also branches on Platform.OS === 'web' here (react-native-web
// support); SymbioteNative ships iOS + Android only, so that branch is dropped rather than
// ported dead.
const IS_EDGE_TO_EDGE = isEdgeToEdge();

const SKIPPED_IMAGE_SOURCE = -1;

// Faithful port of react-native-bootsplash's useHideAnimation style computation (its
// src/index.ts useMemo body): container/logo/brand prop bags the app binds to its own
// View/Image, unchanged across React/Vue/Angular since none of this touches lifecycle.
export function computeHideAnimationStyles(
  config: IHideAnimationConfig,
  constants: IHideAnimationConstants,
  controller: HideAnimationController,
): IHideAnimationResult {
  const { manifest, statusBarTranslucent, navigationBarTranslucent } = config;
  const {
    darkModeEnabled,
    logoSizeRatio = 1,
    navigationBarHeight = 0,
    statusBarHeight = 0,
  } = constants;

  const skipLogo = config.logo == null;
  const skipBrand = manifest.brand == null || config.brand == null;

  const backgroundColor =
    darkModeEnabled && manifest.darkBackground != null
      ? manifest.darkBackground
      : manifest.background;

  const logoSource = skipLogo
    ? undefined
    : darkModeEnabled && config.darkLogo != null
      ? config.darkLogo
      : config.logo;

  const brandSource = skipBrand
    ? undefined
    : darkModeEnabled && config.darkBrand != null
      ? config.darkBrand
      : config.brand;

  const isAndroid = Platform.OS === 'android';

  const container = {
    style: {
      alignItems: 'center' as const,
      backgroundColor,
      justifyContent: 'center' as const,
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      marginTop:
        isAndroid && !IS_EDGE_TO_EDGE && !(statusBarTranslucent ?? false)
          ? -statusBarHeight
          : undefined,
      marginBottom:
        isAndroid && !IS_EDGE_TO_EDGE && !(navigationBarTranslucent ?? false)
          ? -navigationBarHeight
          : undefined,
    },
    onLayout: controller.onContainerLayout,
  };

  const logoSizeMultiplier = isAndroid ? logoSizeRatio : 1;

  const logo: IHideAnimationImageProps =
    logoSource == null
      ? { source: SKIPPED_IMAGE_SOURCE }
      : {
          source: logoSource,
          fadeDuration: 0,
          resizeMode: 'contain',
          style: {
            width: manifest.logo.width * logoSizeMultiplier,
            height: manifest.logo.height * logoSizeMultiplier,
          },
          onLoadEnd: controller.onLogoLoadEnd,
        };

  const brand: IHideAnimationImageProps =
    brandSource == null || manifest.brand == null
      ? { source: SKIPPED_IMAGE_SOURCE }
      : {
          source: brandSource,
          fadeDuration: 0,
          resizeMode: 'contain',
          style: {
            position: 'absolute',
            bottom: manifest.brand.bottom,
            width: manifest.brand.width,
            height: manifest.brand.height,
          },
          onLoadEnd: controller.onBrandLoadEnd,
        };

  return { container, logo, brand };
}
