// v-model support for controlled-value components (TextInput, Switch, Slider, …). Vue's bare
// `v-model="x"` compiles to prop `modelValue` + emit `update:modelValue`; named `v-model:value="x"`
// compiles to prop `value` + emit `update:value`. These are independent compiler targets, not
// alternatives, so a component accepts either input and fires both update events rather than
// picking one. The RN-parity `value` prop/emit pair is untouched either way. See the
// vue-adapter-events skill (Rule 6) for the read-every-site gotcha this exists to solve.

export function resolveModelValue<T>(
  attrs: Record<string, unknown>,
  isValid: (value: unknown) => value is T,
): T | undefined {
  if (isValid(attrs.modelValue)) return attrs.modelValue;
  if (isValid(attrs.value)) return attrs.value;
  return undefined;
}

// Typed as the exact pair of overloads it calls (not a widened `(event: string, ...)`), so a
// component's fully-overloaded SetupContext `emit` — which also carries its own named events
// (valueChange, focus, …) — is still assignable here: passing a function with MORE call
// signatures than a callback parameter requires is always safe.
type IModelUpdateEmit<T> = ((event: 'update:modelValue', value: T) => void) &
  ((event: 'update:value', value: T) => void);

export function emitModelUpdate<T>(emit: IModelUpdateEmit<T>, value: T): void {
  emit('update:modelValue', value);
  emit('update:value', value);
}
