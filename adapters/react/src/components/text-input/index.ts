// TextInput: the React lifecycle half. The folds/maps (value->text, the W3C/alias resolution)
// and the controlled-write predicate live in @symbiotejs/components/state; the render (intrinsic
// + native-prop mapping) in @symbiotejs/components/view; both shared verbatim with the Vue
// adapter. Here React supplies only the lifecycle: useState for the acknowledged event count
// (it must re-render so the imperative handle echoes the latest), a ref for the host node and
// the last text native holds, the useLayoutEffect controlled-write, the mount autoFocus, and
// useImperativeHandle for focus/blur/clear/isFocused/setSelection.
//
// The controlled handshake hinges on commanding native back with the ACKNOWLEDGED event count
// (setTextAndSelection), never a plain prop re-push. See @symbiotejs/components/state/text-input.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  dispatchViewCommand,
  dlog,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiotejs/engine';
import { blurTextInput, setInputBlurred, setInputFocused } from '../../modules/text-input-state';
import {
  resolveAccessibilityProps,
  resolveTextInputProps,
  renderTextInput,
  foldText,
  textFromChange,
  eventCountFromChange,
  shouldCommandText,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
} from '@symbiotejs/components';
import type {
  ITextInputProps as ITextInputBaseProps,
  ITextInputHandle,
} from '@symbiotejs/components';
import { descriptorToReact } from '../../descriptor-to-react';

export type { ITextInputHandle } from '@symbiotejs/components';

// ITextInputProps is otherwise framework-agnostic, so its base lives in @symbiotejs/components;
// className is React's own field per <prop_types_split_agnostic_vs_per_adapter>. Not destructured
// below, so it falls into `...passthrough` and lands on the single host node, like `style` (also
// left un-destructured, forwarded the same way).
export type ITextInputProps = ITextInputBaseProps & { className?: string };

export const TextInput = forwardRef<ITextInputHandle, ITextInputProps>((rawProps, forwardedRef) => {
  // TextInput is its own host element (not a View wrapper), so it folds aria/role here.
  const props = resolveAccessibilityProps(rawProps);
  // Pull out the fields the lifecycle owns (controlled value, the wrapped handlers, the folded
  // aliases) so they don't reach Fabric raw; everything else rides down via `passthrough`.
  const {
    value,
    defaultValue,
    multiline,
    selection,
    onValueChange,
    onFocus,
    onBlur,
    inputMode,
    enterKeyHint,
    readOnly,
    submitBehavior,
    blurOnSubmit,
    cursorColor,
    selectionColor,
    selectionHandleColor,
    keyboardType,
    returnKeyType,
    editable,
    autoComplete,
    textContentType,
    autoFocus,
    showSoftInputOnFocus,
    underlineColorAndroid,
    ...passthrough
  } = props;

  const isMultiline = multiline === true;
  const folded = resolveTextInputProps({
    inputMode,
    keyboardType,
    enterKeyHint,
    returnKeyType,
    readOnly,
    editable,
    submitBehavior,
    blurOnSubmit,
    multiline: isMultiline,
    cursorColor,
    selectionColor,
    selectionHandleColor,
    autoComplete,
    textContentType,
    showSoftInputOnFocus,
    underlineColorAndroid,
  });

  const ref = useRef<ISymbioteNode | null>(null);
  // JS-side focus state, mirrored from the focus/blur events for isFocused(). RN's
  // TextInputState holds the same; native exposes no synchronous focus getter.
  const focused = useRef(false);
  // The count native last acknowledged. We echo it back on every controlled write so native's
  // eventLag lands on 0 and the write applies.
  const [mostRecentEventCount, setMostRecentEventCount] = useState(INITIAL_EVENT_COUNT);
  // The last text native holds, as far as JS knows. Seeded from the mount-time value because the
  // `text` prop already carries that value down via createNode, so the FIRST controlled value is
  // not a divergence and must NOT re-command. Only later, post-keystroke divergences flow through
  // setTextAndSelection.
  const lastNativeText = useRef<string | undefined>(foldText(value, defaultValue));

  const handleChange = useCallback(
    (event: ISymbioteEvent): void => {
      // Event seam: the controlled handshake hinges on the change payload carrying `text`
      // (+ `eventCount`). iOS and Android Fabric can key these differently, so log the actual
      // shape here; a missing `text` means onValueChange never fires.
      dlog(
        `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
          `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
      );
      const text = textFromChange(event);
      if (text !== undefined) {
        lastNativeText.current = text;
        onValueChange?.(text, event);
      }
      // Ordering matters: record the text first, then bump the acknowledged count, so the count
      // never runs ahead of the text it stands for.
      const count = eventCountFromChange(event);
      if (count !== undefined) setMostRecentEventCount(count);
    },
    [onValueChange],
  );

  const text = foldText(value, defaultValue);

  // Controlled write: when JS-side `value` diverges from what native reported, command the new
  // text down with the acknowledged count. A plain prop re-push would race the user's keystrokes;
  // the command is the only stale-safe path. No deps; it runs after every render and the
  // predicate makes it a no-op unless the text diverged.
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (!shouldCommandText(lastNativeText.current, value)) return;

    const selStart = selection?.start ?? SELECTION_NONE;
    const selEnd = selection?.end ?? selection?.start ?? SELECTION_NONE;
    dlog(
      `TextInput setTextAndSelection count=${mostRecentEventCount} text=${JSON.stringify(value)}`,
    );
    dispatchViewCommand(node, 'setTextAndSelection', [
      mostRecentEventCount,
      value,
      selStart,
      selEnd,
    ]);
    lastNativeText.current = value;
  });

  // autoFocus is driven in JS, not as a native prop: on mount, command `focus` down once (RN does
  // the same via TextInputState.focusInput, TextInput.js:538). Empty deps so it fires only on
  // mount; the native `focus` command is idempotent if already focused.
  useEffect(() => {
    if (autoFocus !== true) return;
    const node = ref.current;
    if (node === null) return;
    dlog('TextInput autoFocus -> focus command');
    dispatchViewCommand(node, 'focus', []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFocus = useCallback(
    (event: ISymbioteEvent): void => {
      focused.current = true;
      // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
      if (ref.current !== null) setInputFocused(ref.current);
      onFocus?.(event);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (event: ISymbioteEvent): void => {
      focused.current = false;
      if (ref.current !== null) setInputBlurred(ref.current);
      onBlur?.(event);
    },
    [onBlur],
  );

  // The imperative API RN exposes on the ref. focus/blur drive native view commands; clear and
  // setSelection reuse setTextAndSelection (the same stale-safe path as a controlled write),
  // echoing the acknowledged event count so native applies them.
  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: (): void => {
        const node = ref.current;
        if (node !== null) dispatchViewCommand(node, 'focus', []);
      },
      blur: (): void => {
        // Routes through TextInputState so the app-wide focus tracking clears too.
        blurTextInput(ref.current);
      },
      clear: (): void => {
        const node = ref.current;
        if (node === null) return;
        dispatchViewCommand(node, 'setTextAndSelection', [mostRecentEventCount, '', 0, 0]);
        lastNativeText.current = '';
      },
      isFocused: (): boolean => focused.current,
      setSelection: (start: number, end: number): void => {
        const node = ref.current;
        if (node === null) return;
        const current = lastNativeText.current ?? '';
        dispatchViewCommand(node, 'setTextAndSelection', [
          mostRecentEventCount,
          current,
          start,
          end,
        ]);
      },
    }),
    [mostRecentEventCount],
  );

  return descriptorToReact(
    renderTextInput({
      multiline: isMultiline,
      text,
      mostRecentEventCount,
      selection,
      folded,
      passthrough: {
        ...passthrough,
        ref,
        onChange: handleChange,
        onFocus: handleFocus,
        onBlur: handleBlur,
      },
    }),
  );
});

TextInput.displayName = 'TextInput';
