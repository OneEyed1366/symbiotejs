// Co-located unit test (ADR 0025): `flattenStyle` is pure, so the test is just `expect`
// against its output: array merge (later wins), nested-array recursion, falsy skipping,
// array/object values passed through untouched, non-object -> {}.

import { describe, expect, it } from 'vitest';
import { flattenStyle } from './index';

describe('flattenStyle', () => {
  it('merges an array with later-wins', () => {
    expect(flattenStyle([{ a: 1, b: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  });

  it('recurses into nested arrays', () => {
    expect(flattenStyle([[{ a: 1 }], [{ a: 2 }]])).toEqual({ a: 2 });
  });

  it('skips falsy entries', () => {
    expect(flattenStyle([null, false, { a: 1 }, undefined])).toEqual({ a: 1 });
  });

  it('passes array property values through untouched', () => {
    expect(flattenStyle({ transform: [{ translateX: 5 }] })).toEqual({
      transform: [{ translateX: 5 }],
    });
  });

  it('flattens a non-object to {}', () => {
    expect(flattenStyle(42)).toEqual({});
  });
});
