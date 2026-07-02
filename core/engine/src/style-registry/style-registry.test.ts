// Co-located unit test (ADR 0025): the style registry. Each test registers its own
// styles and clearGlobalStyles() in beforeEach isolates them from one another.

import { beforeEach, describe, expect, it } from 'vitest';
import { registerStyles, resolveClassName, clearGlobalStyles, scopeClassName } from './index';

describe('style-registry', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  it('resolves an exact registered class name', () => {
    registerStyles({ foo: { color: 'red' } });
    expect(resolveClassName('foo')).toEqual({ color: 'red' });
  });

  it('returns an empty style for an unregistered class name', () => {
    expect(resolveClassName('missing')).toEqual({});
  });

  it('merges an array of registered class names, later wins on collision', () => {
    registerStyles({
      a: { color: 'red', padding: 1 },
      b: { color: 'blue' },
    });
    expect(resolveClassName(['a', 'b'])).toEqual({ color: 'blue', padding: 1 });
  });

  it('passes an object through unchanged', () => {
    expect(resolveClassName({ color: 'red' })).toEqual({ color: 'red' });
  });

  it('finds a compound permutation for a multi-part class string', () => {
    registerStyles({ btnPrimary: { color: 'white', padding: 8 } });
    expect(resolveClassName('btn primary')).toEqual({ color: 'white', padding: 8 });
  });

  it('falls back to per-class merge when no compound is registered, later class wins', () => {
    registerStyles({
      a: { color: 'red' },
      b: { color: 'blue' },
      c: { padding: 4 },
    });
    expect(resolveClassName('a b c')).toEqual({ color: 'blue', padding: 4 });
  });

  it('returns an empty style for undefined, null, and an empty string', () => {
    expect(resolveClassName(undefined)).toEqual({});
    expect(resolveClassName(null)).toEqual({});
    expect(resolveClassName('')).toEqual({});
  });

  it('clears prior registrations', () => {
    registerStyles({ foo: { color: 'red' } });
    clearGlobalStyles();
    expect(resolveClassName('foo')).toEqual({});
  });

  it('resolves a kebab-case class name against its camelCase registered key', () => {
    registerStyles({ sectionLabel: { color: 'red' } });
    expect(resolveClassName('section-label')).toEqual({ color: 'red' });
  });

  it('resolves a kebab-case class name inside a multi-class string, later class wins', () => {
    registerStyles({ sectionLabel: { color: 'red' }, infoText: { color: 'blue' } });
    expect(resolveClassName('section-label info-text')).toEqual({ color: 'blue' });
  });

  it('prefers a literal exact-key match over the kebab->camel fallback when both exist', () => {
    registerStyles({ 'section-label': { color: 'green' }, sectionLabel: { color: 'red' } });
    expect(resolveClassName('section-label')).toEqual({ color: 'green' });
  });
});

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
    // foo-bar isn't in localNames, so it isn't suffixed — but the runtime registry only ever
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
