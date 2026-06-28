// InputAccessoryView: the React lifecycle half (iOS). The host-node assembly (nativeID /
// backgroundColor / style / accessibility forwarding) lives framework-agnostic in
// @symbiote/components/renderInputAccessoryView and is shared verbatim with Vue; here React only
// folds aria/role, bridges the Descriptor, and nests the user children under the host.

import { createElement, type FC, type ReactNode } from 'react';
import {
  renderInputAccessoryView,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';

export interface IInputAccessoryViewProps extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  children?: ReactNode;
}

export const InputAccessoryView: FC<IInputAccessoryViewProps> = rawProps => {
  // Owns its host element (symbiote-input-accessory-view), so it folds aria/role here; the
  // resolved accessibility* surface rides the node via `...passthrough`.
  const { nativeID, backgroundColor, style, children, ...passthrough } =
    resolveAccessibilityProps(rawProps);
  const host = renderInputAccessoryView({ nativeID, backgroundColor, style, passthrough });
  // host has no structural children; the user children nest directly under it.
  return createElement(host.type, { key: host.key, ...host.props }, children);
};
