// TextInput: the render half (framework-agnostic). Picks the intrinsic (single- vs multiline)
// and maps the resolved props onto it: the controlled value rides as the private `text` prop
// plus `mostRecentEventCount`, the W3C/alias folds arrive pre-resolved in `folded`, and the
// ref + the change/focus/blur handlers + every pass-through prop (accessibility, testID, the
// remaining native events) arrive folded into `passthrough` and land on the host untouched.
// Pure and prop-driven; no hooks, no events. The adapter owns those.

import { dlog } from '@symbiotejs/engine';
import { el } from '../descriptor';
import type { IDescriptor } from '../descriptor';
import type { IFoldedTextInputProps, ITextInputSelection } from '../state/text-input';

// One host element per native input class. Text carries the only non-trivial nesting elsewhere;
// here the choice is binary and runtime (the `multiline` prop), so the module stays flat.
const SINGLELINE_INTRINSIC = 'symbiote-text-input';
const MULTILINE_INTRINSIC = 'symbiote-text-input-multiline';

export type ITextInputViewProps = {
  multiline: boolean;
  // The controlled value, already folded value/defaultValue -> single `text` (undefined when
  // uncontrolled). There is no `value` Fabric prop; this is the whole controlled surface.
  text: string | undefined;
  mostRecentEventCount: number;
  selection?: ITextInputSelection;
  folded: IFoldedTextInputProps;
  passthrough: Record<string, unknown>;
};

export function renderTextInput(view: ITextInputViewProps): IDescriptor {
  const intrinsic = view.multiline ? MULTILINE_INTRINSIC : SINGLELINE_INTRINSIC;
  dlog(
    `TextInput render multiline=${String(view.multiline)} ` +
      `text=${JSON.stringify(view.text)} count=${view.mostRecentEventCount}`,
  );

  const props: Record<string, unknown> = {
    ...view.passthrough,
    text: view.text,
    mostRecentEventCount: view.mostRecentEventCount,
    selection: view.selection,
    keyboardType: view.folded.keyboardType,
    returnKeyType: view.folded.returnKeyType,
    editable: view.folded.editable,
    submitBehavior: view.folded.submitBehavior,
    selectionColor: view.folded.selectionColor,
    cursorColor: view.folded.cursorColor,
    selectionHandleColor: view.folded.selectionHandleColor,
    underlineColorAndroid: view.folded.underlineColorAndroid,
    autoComplete: view.folded.autoComplete,
    textContentType: view.folded.textContentType,
    showSoftInputOnFocus: view.folded.showSoftInputOnFocus,
  };

  return el(intrinsic, props);
}
