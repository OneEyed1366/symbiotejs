// Co-located unit test: isSymbioteEvent narrows `unknown` to ISymbioteEvent. It lives next to
// the interface it tests (Information Expert) rather than under the scroll-view-specific module
// that used to own a private copy of this exact guard.

import { describe, expect, it } from 'vitest';
import { createElement, isSymbioteEvent, type ISymbioteEvent } from '../node';

describe('isSymbioteEvent', () => {
  it('narrows a real synthetic event object', () => {
    const target = createElement('RCTView');
    const event: ISymbioteEvent = {
      type: 'topPress',
      target,
      currentTarget: target,
      nativeEvent: {},
      stopPropagation: () => {},
    };

    expect(isSymbioteEvent(event)).toBe(true);
  });

  it('rejects a plain object with no nativeEvent', () => {
    expect(isSymbioteEvent({ type: 'topPress' })).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isSymbioteEvent(undefined)).toBe(false);
  });

  it('rejects a primitive', () => {
    expect(isSymbioteEvent('topPress')).toBe(false);
  });
});
