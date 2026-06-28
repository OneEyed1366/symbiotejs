// TextInput, the Vue lifecycle half. The folds/maps (value->text, the W3C/alias resolution)
// and the controlled-write predicate live in @symbiote/components/state, the render (intrinsic
// + native-prop mapping) in @symbiote/components/view, both shared verbatim with the React
// adapter. Here Vue supplies only the reactivity: a shallowRef holds the host node, a ref holds
// the acknowledged event count (so the exposed handle echoes the latest), setup-scope `let`s
// hold the last native text + focus flag, a post-flush watch runs the controlled-write command,
// and expose() wires the imperative handle. The Vue twin of the React useState/useRef +
// useLayoutEffect + useImperativeHandle.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard rather than a cast.
// onChangeText MUST be stripped from the forwarded attrs: it is not a ViewConfig event (RN
// derives it from onChange), so leaking it would reach Fabric as a function prop and crash
// Android's folly::dynamic. The imperative module (blurTextInput / setInput*) is imported from
// @symbiote/engine, the same framework-agnostic singleton both adapters share.

import { defineComponent, ref, shallowRef, watch, type SetupContext } from '@vue/runtime-core';
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
  type ITextInputSelection,
} from '@symbiote/components';
import {
  dispatchViewCommand,
  isSymbioteNode,
  dlog,
  blurTextInput,
  setInputFocused,
  setInputBlurred,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote/engine';
import { descriptorToVue } from './descriptor-to-vue';
import { normalizeVueAttrs } from './normalize-attrs';

export type { ITextInputProps, ITextInputHandle } from '@symbiote/components';

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// selection arrives untyped; keep only the numeric start/end the render fn + controlled write read.
function normalizeSelection(value: unknown): ITextInputSelection | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.start !== 'number') return undefined;
  const selection: ITextInputSelection = { start: value.start };
  if (typeof value.end === 'number') selection.end = value.end;
  return selection;
}

// The prop/handler keys the lifecycle consumes itself (mirrors the React adapter's destructure);
// everything else (placeholder, secureTextEntry, the remaining native events, accessibility,
// testID, style…) forwards onto the host node. onChange/onFocus/onBlur are re-supplied as our
// wrapped handlers; onChangeText is pure JS and must never reach Fabric.
const HANDLED_ATTRS = [
  'value',
  'defaultValue',
  'multiline',
  'selection',
  'inputMode',
  'enterKeyHint',
  'readOnly',
  'submitBehavior',
  'blurOnSubmit',
  'cursorColor',
  'selectionColor',
  'selectionHandleColor',
  'keyboardType',
  'returnKeyType',
  'editable',
  'autoComplete',
  'textContentType',
  'autoFocus',
  'showSoftInputOnFocus',
  'underlineColorAndroid',
  'onChange',
  'onChangeText',
  'onFocus',
  'onBlur',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export const TextInput = defineComponent({
  name: 'TextInput',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, expose }: SetupContext) {
    // shallowRef, NOT ref: the engine node must be held by IDENTITY. A plain ref() runs the node
    // through Vue's toReactive(), handing back a reactive Proxy, a different object than the raw
    // node the engine's WeakMap mirror is keyed on, so every imperative command
    // (dispatchViewCommand / focus / blur / setTextAndSelection) would miss and silently no-op.
    // See .claude/skills/vue-adapter-reactivity. Same rule as the Switch / ScrollView host node.
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNodeRef = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };

    // The count native last acknowledged. A ref so the render echoes it back as
    // mostRecentEventCount and the exposed handle reads the latest; the controlled write commands
    // it so native's eventLag lands on 0.
    const mostRecentEventCount = ref(INITIAL_EVENT_COUNT);
    // The last text native holds, as far as JS knows. Seeded from the mount-time value (the `text`
    // prop already carries it down via createNode, so the FIRST controlled value is not a
    // divergence and must NOT re-command). A setup-scope `let`: no render needed when it changes.
    let lastNativeText = foldText(asString(rawAttrs.value), asString(rawAttrs.defaultValue));
    // JS-side focus state, mirrored from the focus/blur events for isFocused(): native exposes no
    // synchronous focus getter (RN's TextInputState holds the same).
    let focused = false;
    // autoFocus fires once when the node first commits; guard so a later node identity change does
    // not re-focus.
    let autoFocused = false;

    const handleChange = (event: ISymbioteEvent): void => {
      // Event seam: the controlled handshake hinges on the change payload carrying `text`
      // (+ `eventCount`). iOS and Android Fabric can key these differently, so log the actual shape.
      dlog(
        `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
          `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
      );
      const text = textFromChange(event);
      if (text !== undefined) {
        // Record the text first, then the count, so the count never runs ahead of the text it
        // stands for.
        lastNativeText = text;
        const onChangeText = rawAttrs.onChangeText;
        if (isHandler(onChangeText)) onChangeText(text);
      }
      const count = eventCountFromChange(event);
      if (count !== undefined) mostRecentEventCount.value = count;
      const onChange = rawAttrs.onChange;
      if (isHandler(onChange)) onChange(event);
    };

    const handleFocus = (event: ISymbioteEvent): void => {
      focused = true;
      // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
      const node = nodeRef.value;
      if (node !== null) setInputFocused(node);
      const onFocus = rawAttrs.onFocus;
      if (isHandler(onFocus)) onFocus(event);
    };

    const handleBlur = (event: ISymbioteEvent): void => {
      focused = false;
      const node = nodeRef.value;
      if (node !== null) setInputBlurred(node);
      const onBlur = rawAttrs.onBlur;
      if (isHandler(onBlur)) onBlur(event);
    };

    // Controlled write: when JS-side `value` diverges from what native reported, command the new
    // text down with the acknowledged count; a plain prop re-push would race the user's
    // keystrokes. Watching `value` covers every divergence (the parent only rewrites `value` after
    // a change). flush:'post' so the engine has committed the node before the command reads its
    // Fabric handle; the predicate makes it a no-op on mount (value === the seed).
    watch(
      () => asString(rawAttrs.value),
      value => {
        const node = nodeRef.value;
        if (node === null) return;
        if (!shouldCommandText(lastNativeText, value)) return;
        const selection = normalizeSelection(rawAttrs.selection);
        const selStart = selection?.start ?? SELECTION_NONE;
        const selEnd = selection?.end ?? selection?.start ?? SELECTION_NONE;
        dlog(
          `TextInput setTextAndSelection count=${mostRecentEventCount.value} text=${JSON.stringify(value)}`,
        );
        dispatchViewCommand(node, 'setTextAndSelection', [
          mostRecentEventCount.value,
          value,
          selStart,
          selEnd,
        ]);
        lastNativeText = value;
      },
      { flush: 'post' },
    );

    // autoFocus is driven in JS, not as a native prop: when the node first commits, command `focus`
    // down once (RN does the same via TextInputState.focusInput). flush:'post' so the node exists.
    watch(
      nodeRef,
      node => {
        if (autoFocused || node === null || rawAttrs.autoFocus !== true) return;
        autoFocused = true;
        dlog('TextInput autoFocus -> focus command');
        dispatchViewCommand(node, 'focus', []);
      },
      { flush: 'post' },
    );

    // The imperative API RN exposes on the ref. The methods read nodeRef.value / the count LIVE,
    // so no stale capture: the Vue twin of React's useImperativeHandle. focus/blur drive native
    // view commands; clear and setSelection reuse setTextAndSelection (the same stale-safe path as
    // a controlled write) echoing the acknowledged event count.
    expose({
      focus: (): void => {
        const node = nodeRef.value;
        if (node !== null) dispatchViewCommand(node, 'focus', []);
      },
      blur: (): void => {
        // Routes through TextInputState so the app-wide focus tracking clears too.
        blurTextInput(nodeRef.value);
      },
      clear: (): void => {
        const node = nodeRef.value;
        if (node === null) return;
        dispatchViewCommand(node, 'setTextAndSelection', [mostRecentEventCount.value, '', 0, 0]);
        lastNativeText = '';
      },
      isFocused: (): boolean => focused,
      setSelection: (start: number, end: number): void => {
        const node = nodeRef.value;
        if (node === null) return;
        const current = lastNativeText ?? '';
        dispatchViewCommand(node, 'setTextAndSelection', [
          mostRecentEventCount.value,
          current,
          start,
          end,
        ]);
      },
    });

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const multiline = attrs.multiline === true;
      const folded = resolveTextInputProps({
        inputMode: asString(attrs.inputMode),
        keyboardType: asString(attrs.keyboardType),
        enterKeyHint: asString(attrs.enterKeyHint),
        returnKeyType: asString(attrs.returnKeyType),
        readOnly: asBoolean(attrs.readOnly),
        editable: asBoolean(attrs.editable),
        submitBehavior: asString(attrs.submitBehavior),
        blurOnSubmit: asBoolean(attrs.blurOnSubmit),
        multiline,
        cursorColor: asString(attrs.cursorColor),
        selectionColor: asString(attrs.selectionColor),
        selectionHandleColor: asString(attrs.selectionHandleColor),
        autoComplete: asString(attrs.autoComplete),
        textContentType: asString(attrs.textContentType),
        showSoftInputOnFocus: asBoolean(attrs.showSoftInputOnFocus),
        underlineColorAndroid: asString(attrs.underlineColorAndroid),
      });
      const text = foldText(asString(attrs.value), asString(attrs.defaultValue));
      return descriptorToVue(
        renderTextInput({
          multiline,
          text,
          mostRecentEventCount: mostRecentEventCount.value,
          selection: normalizeSelection(attrs.selection),
          folded,
          passthrough: {
            ...resolveAccessibilityProps(forwardAttrs(attrs)),
            ref: setNodeRef,
            onChange: handleChange,
            onFocus: handleFocus,
            onBlur: handleBlur,
          },
        }),
      );
    };
  },
});
