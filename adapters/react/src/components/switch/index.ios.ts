// Switch, iOS host binding. iOS's native Switch takes onTintColor (ON-track) / tintColor
// (OFF-track), and snaps native back via the `setValue` command (Switch.js:221-225).

import { descriptorToReact } from '../../descriptor-to-react';
import { useSwitchLogic } from './shared';
import type { ISwitchHostPlatform, ISwitchProps } from './shared';

export type { ISwitchProps, ISwitchTrackColor } from './shared';

const PLATFORM: ISwitchHostPlatform = {
  snapBackCommand: 'setValue',
  trackColorProps: (_value, trackColor) => ({
    onTintColor: trackColor?.true,
    tintColor: trackColor?.false,
  }),
};

// A top-level named function, not a factory-returned closure: React Compiler's
// component detection only walks top-level declarations (see shared.ts).
export function Switch(rawProps: ISwitchProps) {
  return descriptorToReact(useSwitchLogic(rawProps, PLATFORM));
}
