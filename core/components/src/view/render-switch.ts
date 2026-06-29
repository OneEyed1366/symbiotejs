// Switch: the render half (framework-agnostic). Maps the resolved props onto the single
// `symbiote-switch` host node: the strict value fold lands as the `value` Fabric prop, the
// track colors take platform-specific prop NAMES (iOS onTintColor/tintColor vs Android
// trackColorFor*/trackTintColor, supplied via `platform`), thumbColor → thumbTintColor, and
// ios_backgroundColor folds into the style as the pill that shows through the shrunken track.
// Pure and prop-driven; no hooks, no events. The adapter owns those.

import { dlog } from '@symbiote/engine';
import type { IStyleProp, IViewStyle, ISymbioteEvent } from '@symbiote/engine';
import { el } from '../descriptor';
import type { IDescriptor } from '../descriptor';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';

export type ISwitchTrackColor = { false?: string; true?: string };

// Author-facing props: the framework-agnostic public surface every adapter exposes (the
// controlled value/onValueChange contract, track/thumb colors, style). Identical across
// adapters; each supplies only its hook + bridge.
export interface ISwitchProps extends IAccessibilityProps, IAriaProps {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onChange?: (event: ISymbioteEvent) => void;
  disabled?: boolean;
  trackColor?: ISwitchTrackColor;
  thumbColor?: string;
  ios_backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
}

// The per-platform piece the render needs: the track-color prop NAMES differ between hosts
// (iOS onTintColor/tintColor vs Android trackColorForTrue/trackColorForFalse + trackTintColor
// for the current value). The adapter's .ios/.android file supplies the mapping.
export type ISwitchPlatform = {
  trackColorProps: (value: boolean, trackColor?: ISwitchTrackColor) => Record<string, unknown>;
};

// The pre-resolved inputs the render fn paints from. `value` arrives already folded to a
// strict boolean by the adapter; accessibility / testID / the ref + onChange handler arrive
// folded into `passthrough` and land on the host node untouched.
export type ISwitchViewProps = {
  value: boolean;
  disabled?: boolean;
  trackColor?: ISwitchTrackColor;
  thumbColor?: string;
  ios_backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

// RN rounds the iOS background pill to this radius when ios_backgroundColor is set.
const IOS_BACKGROUND_BORDER_RADIUS = 16;

// Fold ios_backgroundColor into the style, matching RN's iOS branch: it paints the
// background that shows through the shrunken track. Untouched when unset, so a caller's own
// backgroundColor wins by simply not passing ios_backgroundColor.
function foldIosBackground(
  style: IStyleProp<IViewStyle> | undefined,
  color: string | undefined,
): IStyleProp<IViewStyle> | undefined {
  if (color === undefined) return style;
  return [style, { backgroundColor: color, borderRadius: IOS_BACKGROUND_BORDER_RADIUS }];
}

export function renderSwitch(view: ISwitchViewProps, platform: ISwitchPlatform): IDescriptor {
  dlog(`Switch render value=${view.value} disabled=${String(view.disabled)}`);

  // These color props reach Fabric as ordinary props: the shared ViewConfig declares
  // Switch's only event as `change`, so routeProp sends the on*-prefixed color names through
  // setProp rather than mistaking them for listeners.
  const props: Record<string, unknown> = {
    ...view.passthrough,
    value: view.value,
    disabled: view.disabled,
    ...platform.trackColorProps(view.value, view.trackColor),
    thumbTintColor: view.thumbColor,
    style: foldIosBackground(view.style, view.ios_backgroundColor),
  };

  return el('symbiote-switch', props);
}
