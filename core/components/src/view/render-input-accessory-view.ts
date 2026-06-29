// InputAccessoryView: the render half (framework-agnostic, iOS). A real Fabric host node,
// RCTInputAccessoryView, that docks its content above the keyboard. It is referenced by
// `nativeID`, which a TextInput points at through its `inputAccessoryViewID` prop; native pairs
// the two by id. There is no JS-side translation: style / nativeID / backgroundColor map straight
// onto the intrinsic and the user children (injected by the adapter) nest under it. Shared
// verbatim across adapters: React and Vue both bridge this Descriptor.

import { dlog, type IStyleProp, type IViewStyle } from '@symbiote/engine';
import { el, type IDescriptor } from '../descriptor';

// The pre-resolved inputs renderInputAccessoryView paints from. The adapter narrows the typed
// fields (nativeID / backgroundColor / style) and folds everything else (accessibility*, testID)
// into `passthrough`, which lands on the host node untouched.
export type IInputAccessoryViewViewProps = {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

export function renderInputAccessoryView(view: IInputAccessoryViewViewProps): IDescriptor {
  const props: Record<string, unknown> = { ...view.passthrough, style: view.style };
  if (view.nativeID !== undefined) props.nativeID = view.nativeID;
  if (view.backgroundColor !== undefined) props.backgroundColor = view.backgroundColor;

  dlog('InputAccessoryView -> RCTInputAccessoryView');

  // Empty structural children: the adapter appends the user children directly under the host.
  return el('symbiote-input-accessory-view', props, []);
}
