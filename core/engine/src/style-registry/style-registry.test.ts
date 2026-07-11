// Unit test for the style registry. Each test registers its own
// styles and clearGlobalStyles() in beforeEach isolates them from one another.

import { beforeEach, describe, expect, it } from 'vitest';
import { registerStyles, resolveClassName, clearGlobalStyles } from './index';

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
