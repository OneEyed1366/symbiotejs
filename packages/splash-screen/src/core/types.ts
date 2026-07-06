import type { IImageSourceProp, IResizeMode } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';

export type IHideConfig = {
  fade?: boolean;
};

export type IManifest = {
  background: string;
  darkBackground?: string;
  logo: {
    width: number;
    height: number;
  };
  brand?: {
    bottom: number;
    width: number;
    height: number;
  };
};

export type IHideAnimationConfig = {
  manifest: IManifest;
  ready?: boolean;

  logo?: IImageSourceProp;
  darkLogo?: IImageSourceProp;
  brand?: IImageSourceProp;
  darkBrand?: IImageSourceProp;

  animate: () => void;

  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
};

export type IHideAnimationContainerProps = {
  style: IStyleProp<IViewStyle>;
  onLayout: () => void;
};

export type IHideAnimationImageProps = {
  source: IImageSourceProp;
  fadeDuration?: number;
  resizeMode?: IResizeMode;
  style?: IStyleProp<IViewStyle>;
  onLoadEnd?: () => void;
};

export type IHideAnimationResult = {
  container: IHideAnimationContainerProps;
  logo: IHideAnimationImageProps;
  brand: IHideAnimationImageProps;
};

// Mirrors react-native-bootsplash's NativeRNBootSplash Spec.getConstants() return shape.
export type IHideAnimationConstants = {
  darkModeEnabled: boolean;
  logoSizeRatio?: number;
  navigationBarHeight?: number;
  statusBarHeight?: number;
};
