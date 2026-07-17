// ActivityIndicator on Android: AndroidProgressBar needs `styleAttr` (it drives the
// ProgressBar's setStyle(); without it the view throws "setStyle() not called") and
// `indeterminate: true`, and its default color is the theme (null), per RN's
// ActivityIndicator.js android branch ({styleAttr:'Normal', indeterminate:true}). Metro
// picks this on an Android host; no Platform.OS read.
// device-verify-pending: prop names mirror RN's AndroidProgressBar, proven on a real
// host by the absence of the "setStyle() not called" red box.

import { descriptorToReact } from '../../descriptor-to-react';
import { useActivityIndicatorLogic } from './shared';
import type { IActivityIndicatorPlatform, IActivityIndicatorProps } from './shared';
export type { IActivityIndicatorProps } from './shared';

const PLATFORM: IActivityIndicatorPlatform = {
  // RN: `color = Platform.OS === 'ios' ? GRAY : null`; Android lets the theme color it.
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
};

// A top-level named function, not a factory-returned closure: React Compiler's
// component detection only walks top-level declarations (see shared.ts).
export function ActivityIndicator(rawProps: IActivityIndicatorProps) {
  return descriptorToReact(useActivityIndicatorLogic(rawProps, PLATFORM));
}
