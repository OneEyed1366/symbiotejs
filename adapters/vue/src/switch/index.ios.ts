// Switch on iOS: the native Switch takes onTintColor (ON-track) / tintColor (OFF-track) and
// snaps native back via the `setValue` command. Also the base (switch.ts re-exports it) for
// headless / web. Mirrors the React adapter's iOS binding. See ADR 0020.

import { createSwitch } from './shared';

export const Switch = createSwitch({
  snapBackCommand: 'setValue',
  trackColorProps: (_value, trackColor) => ({
    onTintColor: trackColor?.true,
    tintColor: trackColor?.false,
  }),
});
