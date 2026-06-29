// Mirrors RN's TextInput/TextInputState: the single currently-focused input, tracked
// JS-side because native exposes no focus getter. TextInput reports focus/blur here so
// Keyboard.dismiss can blur whatever holds focus without a ref, exactly how RN's
// dismissKeyboard() works (blurTextInput(currentlyFocusedInput())).

import { dispatchViewCommand } from './commit';
import { dlog } from './debug';
import type { ISymbioteNode } from './node';

let currentlyFocused: ISymbioteNode | null = null;

// The input that last reported focus and hasn't reported blur, or null.
export function currentlyFocusedInput(): ISymbioteNode | null {
  return currentlyFocused;
}

// TextInput's focus event reports the node here; its blur event clears it (only if it
// is still the current one; a later input may have taken focus in between).
export function setInputFocused(node: ISymbioteNode): void {
  currentlyFocused = node;
}

export function setInputBlurred(node: ISymbioteNode): void {
  if (currentlyFocused === node) currentlyFocused = null;
}

// Imperative blur: drive the native `blur` view command and drop the tracked focus.
// Used by TextInput.blur() and Keyboard.dismiss().
export function blurTextInput(node: ISymbioteNode | null): void {
  if (node === null) return;
  dlog('TextInputState.blurTextInput -> blur command');
  dispatchViewCommand(node, 'blur', []);
  setInputBlurred(node);
}
