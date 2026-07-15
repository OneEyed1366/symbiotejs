// Runtime guards to narrow `unknown` at trust boundaries (native payloads, ViewConfig
// attributes, style values) without an `as` cast. `isRecord` excludes arrays - most
// call sites mean "a native payload keyed by string," never a list.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
