// ActivityIndicator on Android: AndroidProgressBar needs `styleAttr` (it drives the
// ProgressBar's setStyle(); without it the view throws "setStyle() not called") and
// `indeterminate: true`, and its default color is the theme (null). Metro picks this on an
// Android host; no Platform.OS read. Mirrors the React adapter's Android binding. See ADR 0020.

import { createActivityIndicator } from './shared';

export const ActivityIndicator = createActivityIndicator({
  // RN: `color = Platform.OS === 'ios' ? GRAY : null`. Android lets the theme color it.
  defaultColor: null,
  nativeExtras: { styleAttr: 'Normal', indeterminate: true },
});
