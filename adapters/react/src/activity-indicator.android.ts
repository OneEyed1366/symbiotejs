// ActivityIndicator on Android: AndroidProgressBar needs `styleAttr` (it drives the
// ProgressBar's setStyle() — without it the view throws "setStyle() not called") and
// `indeterminate: true`, and its default color is the theme (null), per RN's
// ActivityIndicator.js android branch ({styleAttr:'Normal', indeterminate:true}). Metro
// picks this on an Android host; no Platform.OS read. See ADR 0020.
// device-verify-pending: prop names mirror RN's AndroidProgressBar, proven on a real
// host by the absence of the "setStyle() not called" red box.

import { createActivityIndicator } from './activity-indicator-shared'
export type { ActivityIndicatorProps } from './activity-indicator-shared'

export const ActivityIndicator = createActivityIndicator({
  // RN: `color = Platform.OS === 'ios' ? GRAY : null` — Android lets the theme color it.
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
})
