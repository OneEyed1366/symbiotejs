// PixelRatio: device pixel density helpers, a faithful port of RN's
// Libraries/Utilities/PixelRatio.js. Every value derives from
// Dimensions.get('window'): `get()` is the pixel scale, `getFontScale()` the user's
// text-size factor (falling back to scale when unset), and the two conversion
// helpers snap layout sizes (dp) onto the physical pixel grid. iOS-only
// startDetecting() is a no-op, kept for API parity.

import { Dimensions } from '../dimensions';

export interface IPixelRatioStatic {
  get(): number;
  getFontScale(): number;
  getPixelSizeForLayoutSize(layoutSize: number): number;
  roundToNearestPixel(layoutSize: number): number;
  startDetecting(): void;
}

export const PixelRatio: IPixelRatioStatic = {
  get(): number {
    return Dimensions.get('window').scale;
  },

  // RN: fontScale || get(). A 0/absent fontScale falls back to the pixel scale.
  getFontScale(): number {
    return Dimensions.get('window').fontScale || PixelRatio.get();
  },

  // dp -> px, guaranteed integer.
  getPixelSizeForLayoutSize(layoutSize: number): number {
    return Math.round(layoutSize * PixelRatio.get());
  },

  // Snap a dp size to the nearest value that maps to a whole number of pixels.
  roundToNearestPixel(layoutSize: number): number {
    const ratio = PixelRatio.get();
    return Math.round(layoutSize * ratio) / ratio;
  },

  // No-op on iOS (web-only in RN). Kept for API parity.
  startDetecting(): void {},
};
