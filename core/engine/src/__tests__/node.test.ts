// Co-located next to the interface it tests (Information Expert), replacing the private copy
// scroll-view-commands.ts used to own.

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
