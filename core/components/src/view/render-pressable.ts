// Pressable: the render half (framework-agnostic). Pressable owns no host element of its own:
// it composes the adapter's View (so children stay framework nodes), so this layer does not paint
// a Descriptor. It resolves the two prop decisions that are identical across adapters: which
// listeners the responder View carries (gated on disabled + cancelable), and how `disabled` folds
// into accessibilityState. The adapter feeds these into its View element. Pure, no framework.

import { dlog } from '@symbiotejs/engine';
import type { IAccessibilityStateValue } from '../accessibility-props';
import type { IPressHandlers } from '../state/pressable';

// RN merges `disabled` into the resolved accessibilityState so a disabled Pressable reports the
// disabled state even if the caller passed none (Pressable.js: disabled != null ? {...state,
// disabled} : state). Untouched when disabled is unset.
export function resolveDisabledAccessibilityState(
  accessibilityState: IAccessibilityStateValue | undefined,
  disabled: boolean | undefined,
): IAccessibilityStateValue | undefined {
  return disabled !== undefined ? { ...accessibilityState, disabled } : accessibilityState;
}

// The listeners the responder View carries. When disabled, leave them off entirely. A press
// never fires and pressed-state never flips, exactly as RN's disabled Pressable. cancelable ===
// false refuses to yield the responder (RN routes cancelable to onResponderTerminationRequest,
// default true when unset).
export function buildPressableListeners(
  handlers: IPressHandlers,
  options: { disabled?: boolean; cancelable?: boolean },
): Record<string, unknown> {
  if (options.disabled === true) {
    dlog('Pressable disabled — listeners suppressed');
    return {};
  }
  const listeners: Record<string, unknown> = {
    onPress: handlers.handlePress,
    onPressIn: handlers.handlePressIn,
    onPressOut: handlers.handlePressOut,
    // Claim the responder so the move stream reaches this View; retention reads it.
    onStartShouldSetResponder: () => true,
    onResponderMove: handlers.handleResponderMove,
  };
  if (options.cancelable !== undefined) {
    listeners.onResponderTerminationRequest = () => options.cancelable;
  }
  return listeners;
}

// Hover has no event on a touch host: there is no pointer-enter/leave. The adapter accepts and
// types the RN hover props but forwards nothing; this records the no-op so a missing hover
// callback on device is explained, not silent (RN onHoverIn/onHoverOut).
export function noteHoverNoop(onHoverIn: unknown, onHoverOut: unknown): void {
  if (onHoverIn !== undefined || onHoverOut !== undefined) {
    dlog('Pressable hover is a no-op on this host (no pointer-enter/leave event)');
  }
}
