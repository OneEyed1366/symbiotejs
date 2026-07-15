import { describe, expect, it } from 'vitest';
import { isBoolean, isNumber, isRecord, isString } from './index';

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects an array (the stricter, canonical behavior)', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it('rejects null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('rejects primitives', () => {
    expect(isRecord('x')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('isBoolean', () => {
  it('accepts true/false', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
  });

  it('rejects non-booleans', () => {
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean(null)).toBe(false);
    expect(isBoolean(undefined)).toBe(false);
  });
});

describe('isNumber', () => {
  it('accepts numbers, including NaN (typeof-correct, not value-correct)', () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(-1.5)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(true);
  });

  it('rejects non-numbers', () => {
    expect(isNumber('1')).toBe(false);
    expect(isNumber(null)).toBe(false);
    expect(isNumber(undefined)).toBe(false);
  });
});

describe('isString', () => {
  it('accepts strings', () => {
    expect(isString('')).toBe(true);
    expect(isString('hello')).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isString(1)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });
});
