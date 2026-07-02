// Switch is the React lifecycle half. The logic (the lastNativeReport reducer, valueFromChange,
// the snap-back decision) lives in @symbiote/components/state, the render (value fold, track
// colors, ios_backgroundColor) in @symbiote/components/view; here the adapter only owns the
// hook: useReducer over the shared reducer, a ref for the imperative command, and the
// useLayoutEffect that snaps native back when the parent rejects a toggle.
//
// Switch is controlled exactly like RN's: the parent's onValueChange MUST update `value` for
// the toggle to stick. If the handler is a no-op, native has already flipped its own grip, so
// JS commands the old value back down (a plain prop re-push cannot cover the no-op case: the
// prop never changes, so the retained tree never diverges). The command name is platform-
// specific (iOS setValue / Android setNativeValue) and arrives via `platform`.

import { useCallback, useLayoutEffect, useReducer, useRef } from 'react';
import type { FC } from 'react';
import {
  renderSwitch,
  switchReducer,
  createInitialSwitchState,
  shouldSnapBack,
  valueFromChange,
} from '@symbiote/components';
import type { ISwitchPlatform, ISwitchProps as ISwitchBaseProps } from '@symbiote/components';
import {
  dispatchViewCommand,
  dlog,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote/engine';
import { resolveAccessibilityProps } from '@symbiote/components';
import { descriptorToReact } from '../../descriptor-to-react';

// ISwitchProps is otherwise framework-agnostic (the controlled value contract, no ref /
// children), so its base lives in @symbiote/components; React supplies only the hook
// (useReducer + the snap-back useLayoutEffect) and the descriptor bridge.
export type { ISwitchTrackColor } from '@symbiote/components';

// className is React's own field per <prop_types_split_agnostic_vs_per_adapter>; not destructured
// below, so it falls into `...passthrough` and lands on the single host node, like `style`.
export type ISwitchProps = ISwitchBaseProps & { className?: string };

// The platform piece: the view's track-color name mapping plus the lifecycle's snap-back
// command name. Supplied whole by switch.ios.ts / switch.android.ts (Metro filename-selected).
type ISwitchHostPlatform = ISwitchPlatform & { snapBackCommand: string };

export function createSwitch(platform: ISwitchHostPlatform): FC<ISwitchProps> {
  return rawProps => {
    // Switch owns its host element rather than rendering through a symbiote View, so it folds
    // aria/role into accessibility* here; the resolved accessibility* fields (plus testID etc.)
    // ride down to the host node via `passthrough`.
    const props = resolveAccessibilityProps(rawProps);
    const {
      value,
      onValueChange,
      disabled,
      trackColor,
      thumbColor,
      ios_backgroundColor,
      style,
      ...passthrough
    } = props;

    const ref = useRef<ISymbioteNode | null>(null);
    const [state, dispatch] = useReducer(switchReducer, undefined, createInitialSwitchState);

    const handleChange = useCallback(
      (event: ISymbioteEvent): void => {
        const next = valueFromChange(event);
        dlog(
          `Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`,
        );
        if (next === undefined) return;
        onValueChange?.(next, event);
        dispatch({ type: 'native-reported', value: next });
      },
      [onValueChange],
    );

    // value is a real Fabric prop, folded to a strict boolean: RN sends `value === true`, so
    // an undefined prop reads as "off" rather than absent.
    const fabricValue = value === true;

    useLayoutEffect(() => {
      const node = ref.current;
      if (node === null) return;
      if (!shouldSnapBack(state, fabricValue)) {
        dlog(
          `Switch snap-back no-op reported=${String(state.lastNativeReport)} value=${fabricValue}`,
        );
        return;
      }
      dlog(
        `Switch ${platform.snapBackCommand} snap-back reported=${String(state.lastNativeReport)} value=${fabricValue}`,
      );
      dispatchViewCommand(node, platform.snapBackCommand, [fabricValue]);
    }, [fabricValue, state]);

    const descriptor = renderSwitch(
      {
        value: fabricValue,
        disabled,
        trackColor,
        thumbColor,
        ios_backgroundColor,
        style,
        passthrough: { ...passthrough, ref, onChange: handleChange },
      },
      platform,
    );
    return descriptorToReact(descriptor);
  };
}
