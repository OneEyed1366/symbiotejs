// Unit test for the Vue `<style scoped>` class-name rewriter - a separate responsibility
// from the CSS class registry, see scope.ts's own doc comment.

import { describe, expect, it } from 'vitest';
import { scopeClassName } from './index';

describe('scopeClassName', () => {
  const localNames = new Set(['card']);

  it('suffixes only the local token in a string, preserving order and spacing', () => {
    expect(scopeClassName('card foo', localNames, 'a1b2c3d4')).toBe('card__a1b2c3d4 foo');
  });

  it('normalizes repeated/multiple whitespace to single-space-joined tokens', () => {
    expect(scopeClassName('card   foo\tbar', localNames, 'a1b2c3d4')).toBe(
      'card__a1b2c3d4 foo bar',
    );
  });

  it('rewrites only the local key of a toggle-map object, preserving boolean values', () => {
    const input = { card: true, foo: false };
    expect(scopeClassName(input, localNames, 'a1b2c3d4')).toEqual({
      card__a1b2c3d4: true,
      foo: false,
    });
  });

  it('recurses per element of a mixed string/toggle-map array', () => {
    const input = ['card base', { card: true, foo: false }];
    expect(scopeClassName(input, localNames, 'a1b2c3d4')).toEqual([
      'card__a1b2c3d4 base',
      { card__a1b2c3d4: true, foo: false },
    ]);
  });

  it('passes null and undefined through unchanged', () => {
    expect(scopeClassName(null, localNames, 'a1b2c3d4')).toBeNull();
    expect(scopeClassName(undefined, localNames, 'a1b2c3d4')).toBeUndefined();
  });

  it('recognizes a kebab-case token against the camelCase localNames set, emitting the camel form', () => {
    const camelLocalNames = new Set(['sectionLabel']);
    expect(scopeClassName('section-label foo', camelLocalNames, 'a1b2c3d4')).toBe(
      'sectionLabel__a1b2c3d4 foo',
    );
  });

  it('normalizes an untouched (non-local) kebab-case token to camelCase too', () => {
    // foo-bar isn't in localNames, so it isn't suffixed - but the runtime registry only ever
    // has camelCase keys, so the emitted token must still be normalized or resolveClassName's
    // exact-match would look up an unregistered literal "foo-bar" key.
    expect(scopeClassName('card foo-bar', localNames, 'a1b2c3d4')).toBe('card__a1b2c3d4 fooBar');
  });

  it('recognizes a kebab-case toggle-map key against camelCase localNames', () => {
    const camelLocalNames = new Set(['sectionLabel']);
    const input = { 'section-label': true, 'other-thing': false };
    expect(scopeClassName(input, camelLocalNames, 'a1b2c3d4')).toEqual({
      sectionLabel__a1b2c3d4: true,
      otherThing: false,
    });
  });

  it('does not mutate the input object or array', () => {
    const inputObject = { card: true, foo: false };
    const inputArray = ['card', { card: true }];
    const objectSnapshot = { ...inputObject };
    const arraySnapshot = [...inputArray];

    const resultObject = scopeClassName(inputObject, localNames, 'a1b2c3d4');
    const resultArray = scopeClassName(inputArray, localNames, 'a1b2c3d4');

    expect(inputObject).toEqual(objectSnapshot);
    expect(inputArray).toEqual(arraySnapshot);
    expect(resultObject).not.toBe(inputObject);
    expect(resultArray).not.toBe(inputArray);
  });
});
