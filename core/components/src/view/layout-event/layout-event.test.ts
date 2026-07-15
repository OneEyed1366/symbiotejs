// Co-located unit test: readLayoutField pulls a numeric field out of an onLayout event's
// nativeEvent.layout without a cast. Shared by render-scroll-view's dimension read (width/height)
// and render-scroll-sticky's position read (y/height) - one guard, tested once.

import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import { readLayoutField } from './index';

function makeEvent(nativeEvent: Record<string, unknown>): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'topLayout',
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  };
}

describe('readLayoutField', () => {
  it('reads width out of a well-formed layout event', () => {
    const event = makeEvent({ layout: { x: 0, y: 0, width: 320, height: 480 } });
    expect(readLayoutField(event, 'width')).toBe(320);
  });

  it('reads height out of a well-formed layout event', () => {
    const event = makeEvent({ layout: { x: 0, y: 0, width: 320, height: 480 } });
    expect(readLayoutField(event, 'height')).toBe(480);
  });

  it('reads y out of a well-formed layout event', () => {
    const event = makeEvent({ layout: { x: 0, y: 42, width: 320, height: 480 } });
    expect(readLayoutField(event, 'y')).toBe(42);
  });

  it('returns undefined when nativeEvent.layout is missing', () => {
    const event = makeEvent({});
    expect(readLayoutField(event, 'width')).toBeUndefined();
  });

  it('returns undefined when nativeEvent.layout is null', () => {
    const event = makeEvent({ layout: null });
    expect(readLayoutField(event, 'height')).toBeUndefined();
  });

  it('returns undefined when nativeEvent.layout is not an object', () => {
    const event = makeEvent({ layout: 'not-an-object' });
    expect(readLayoutField(event, 'y')).toBeUndefined();
  });

  it('returns undefined when the requested key is not a number', () => {
    const event = makeEvent({ layout: { width: 'oops' } });
    expect(readLayoutField(event, 'width')).toBeUndefined();
  });

  it('returns undefined when the requested key is absent from layout', () => {
    const event = makeEvent({ layout: { width: 320 } });
    expect(readLayoutField(event, 'height')).toBeUndefined();
  });
});
