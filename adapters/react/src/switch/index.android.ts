// Switch, Android host binding. AndroidSwitch takes trackColorForTrue / trackColorForFalse
// plus trackTintColor (the color for the CURRENT value, which RN computes as value ? true :
// false), and snaps native back via the `setNativeValue` command (Switch.js:221-225).

import { createSwitch } from './shared';

export type { ISwitchProps, ISwitchTrackColor } from './shared';

export const Switch = createSwitch({
  snapBackCommand: 'setNativeValue',
  trackColorProps: (value, trackColor) => ({
    trackColorForFalse: trackColor?.false,
    trackColorForTrue: trackColor?.true,
    trackTintColor: value ? trackColor?.true : trackColor?.false,
  }),
});
