// TextInputState moved to @symbiotejs/engine (a framework-agnostic module: Keyboard.dismiss
// and TextInput both reach it). This thin re-export keeps the adapter's import path stable.
export {
  currentlyFocusedInput,
  setInputFocused,
  setInputBlurred,
  blurTextInput,
} from '@symbiotejs/engine';
