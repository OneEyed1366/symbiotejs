// ActivityIndicator on iOS: RCTActivityIndicatorView takes the size enum + a GRAY
// default color and no extra native props. Also the base (activity-indicator.ts
// re-exports it) for headless / web.

import { descriptorToReact } from '../../descriptor-to-react';
import { useActivityIndicatorLogic } from './shared';
import type { IActivityIndicatorPlatform, IActivityIndicatorProps } from './shared';
export type { IActivityIndicatorProps } from './shared';

// RN's iOS default spinner color (Libraries/.../ActivityIndicator.js GRAY).
const IOS_DEFAULT_COLOR = '#999999';

const PLATFORM: IActivityIndicatorPlatform = {
  defaultColor: IOS_DEFAULT_COLOR,
  nativeExtras: {},
};

// A top-level named function, not a factory-returned closure: React Compiler's
// component detection only walks top-level declarations (see shared.ts).
export function ActivityIndicator(rawProps: IActivityIndicatorProps) {
  return descriptorToReact(useActivityIndicatorLogic(rawProps, PLATFORM));
}
