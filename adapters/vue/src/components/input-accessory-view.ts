// InputAccessoryView: the Vue lifecycle half (iOS). The host-node assembly (nativeID /
// backgroundColor / style / accessibility forwarding) lives framework-agnostic in
// @symbiotejs/components/renderInputAccessoryView and is shared verbatim with React; here Vue only
// narrows the untyped attrs, folds aria/role, bridges the Descriptor, and nests the slot children
// under the host.
//
// FUNCTIONAL, not a stateful defineComponent: render-only (no state). Inputs arrive as attrs
// (untyped); the typed fields are narrowed with runtime guards, the forward-only rest is folded
// so resolveAccessibilityProps lands aria-* onto the host node.

import { h, type FunctionalComponent } from '@vue/runtime-core';
import {
  renderInputAccessoryView,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiotejs/components';
import type { IClassNameValue, IStyleProp, IViewStyle } from '@symbiotejs/engine';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// The Vue-facing prop surface (React's carries `children?: ReactNode`; Vue takes children via slots).
export interface IInputAccessoryViewProps extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  // Not in HANDLED_ATTRS below — passes through untouched onto the host, which already
  // resolves `class`.
  class?: IClassNameValue;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

const HANDLED_ATTRS = ['nativeID', 'backgroundColor', 'style'];

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

const InputAccessoryViewComponent: FunctionalComponent = (_props, { attrs: rawAttrs, slots }) => {
  const attrs = normalizeVueAttrs(rawAttrs);
  const host = renderInputAccessoryView({
    nativeID: asString(attrs.nativeID),
    backgroundColor: asString(attrs.backgroundColor),
    style: isStyleProp(attrs.style) ? attrs.style : undefined,
    passthrough: resolveAccessibilityProps(forwardAttrs(attrs)),
  });
  const slotChildren = slots.default !== undefined ? slots.default() : [];
  return h(host.type, { ...host.props, key: host.key }, slotChildren);
};
InputAccessoryViewComponent.displayName = 'InputAccessoryView';
InputAccessoryViewComponent.inheritAttrs = false;

export const InputAccessoryView = InputAccessoryViewComponent;
