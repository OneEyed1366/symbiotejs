// Switch, Android host binding. AndroidSwitch takes trackColorForTrue / trackColorForFalse
// plus trackTintColor (the color for the CURRENT value, which RN computes as value ? true :
// false), and snaps native back via the `setNativeValue` command (Switch.js:221-225).

import { descriptorToReact } from '../../descriptor-to-react';
import { useSwitchLogic } from './shared';
import type { ISwitchHostPlatform, ISwitchProps } from './shared';

export type { ISwitchProps, ISwitchTrackColor } from './shared';

const PLATFORM: ISwitchHostPlatform = {
  snapBackCommand: 'setNativeValue',
  trackColorProps: (value, trackColor) => ({
    trackColorForFalse: trackColor?.false,
    trackColorForTrue: trackColor?.true,
    trackTintColor: value ? trackColor?.true : trackColor?.false,
  }),
};

// A top-level named function, not a factory-returned closure: React Compiler's
// component detection only walks top-level declarations (see shared.ts).
export function Switch(rawProps: ISwitchProps) {
  return descriptorToReact(useSwitchLogic(rawProps, PLATFORM));
}
