// ActivityIndicator on iOS: RCTActivityIndicatorView takes the size enum + a GRAY
// default color and no extra native props. Also the base (activity-indicator.ts
// re-exports it) for headless / web. See ADR 0020.

import { createActivityIndicator } from './shared';
export type { IActivityIndicatorProps } from './shared';

// RN's iOS default spinner color (Libraries/.../ActivityIndicator.js GRAY).
const IOS_DEFAULT_COLOR = '#999999';

export const ActivityIndicator = createActivityIndicator({
  defaultColor: IOS_DEFAULT_COLOR,
  nativeExtras: {},
});
