// Switch on Android: AndroidSwitch takes trackColorForTrue / trackColorForFalse plus
// trackTintColor (the color for the CURRENT value), and snaps native back via the
// `setNativeValue` command. Metro picks this on an Android host; no Platform.OS read.
// Mirrors the React adapter's Android binding. See ADR 0020.

import { createSwitch } from './shared';

export const Switch = createSwitch({
  snapBackCommand: 'setNativeValue',
  trackColorProps: (value, trackColor) => ({
    trackColorForFalse: trackColor?.false,
    trackColorForTrue: trackColor?.true,
    trackTintColor: value ? trackColor?.true : trackColor?.false,
  }),
});
