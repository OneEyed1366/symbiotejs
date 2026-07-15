// Pure unit coverage for the framework-agnostic pub/sub emitter - zero React, so no fabric/mount
// scaffolding needed (mirrors navigator-state.test.ts's plain reducer coverage, once that lands).

import { describe, expect, it, vi } from 'vitest';
import { NAVIGATION_EVENT_BLUR, NAVIGATION_EVENT_FOCUS, createNavigationEmitter } from './index';

describe('createNavigationEmitter', () => {
  it('calls a listener registered for the emitted event', () => {
    const emitter = createNavigationEmitter();
    const listener = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_FOCUS, listener);

    emitter.emit(NAVIGATION_EVENT_FOCUS, { some: 'payload' });

    expect(listener).toHaveBeenCalledWith({ some: 'payload' });
  });

  it('does not call a listener registered for a different event', () => {
    const emitter = createNavigationEmitter();
    const listener = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_BLUR, listener);

    emitter.emit(NAVIGATION_EVENT_FOCUS);

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple listeners on the same event', () => {
    const emitter = createNavigationEmitter();
    const first = vi.fn();
    const second = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_FOCUS, first);
    emitter.addListener(NAVIGATION_EVENT_FOCUS, second);

    emitter.emit(NAVIGATION_EVENT_FOCUS);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops calling a listener after its unsubscribe is invoked', () => {
    const emitter = createNavigationEmitter();
    const listener = vi.fn();
    const unsubscribe = emitter.addListener(NAVIGATION_EVENT_FOCUS, listener);

    unsubscribe();
    emitter.emit(NAVIGATION_EVENT_FOCUS);

    expect(listener).not.toHaveBeenCalled();
  });

  it('emitting an event with no listeners is a no-op', () => {
    const emitter = createNavigationEmitter();
    expect(() => emitter.emit(NAVIGATION_EVENT_FOCUS)).not.toThrow();
  });
});
