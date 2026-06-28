// Co-located unit test (ADR 0025) for InteractionManager: pure JS, no native. We drive it
// over real 0ms macrotasks (the same setImmediate/setTimeout it schedules on).

import { beforeEach, describe, expect, it, vi } from 'vitest';

let InteractionManager: typeof import('./index').InteractionManager;

beforeEach(async () => {
  vi.resetModules();
  ({ InteractionManager } = await import('./index'));
});

// Resolve on the next macrotask repeatedly, giving the manager's own next-tick scheduling
// room to fire and drain.
function nextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
  await nextTick();
}

describe('InteractionManager', () => {
  it('runs a task after the current tick when no handles are outstanding', async () => {
    let ran = false;
    InteractionManager.runAfterInteractions(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    await settle();
    expect(ran).toBe(true);
  });

  it('defers a task while a handle is outstanding, until it clears', async () => {
    let ran = false;
    const handle = InteractionManager.createInteractionHandle();
    InteractionManager.runAfterInteractions(() => {
      ran = true;
    });
    await settle();
    expect(ran).toBe(false);

    InteractionManager.clearInteractionHandle(handle);
    await settle();
    expect(ran).toBe(true);
  });

  it('cancel() prevents the task from running', async () => {
    let ran = false;
    const interaction = InteractionManager.runAfterInteractions(() => {
      ran = true;
    });
    interaction.cancel();
    await settle();
    expect(ran).toBe(false);
  });

  it('fires interactionStart/Complete across the handle boundary', () => {
    let started = 0;
    let completed = 0;
    const startSub = InteractionManager.addListener(
      InteractionManager.Events.interactionStart,
      () => {
        started += 1;
      },
    );
    const completeSub = InteractionManager.addListener(
      InteractionManager.Events.interactionComplete,
      () => {
        completed += 1;
      },
    );

    const handle = InteractionManager.createInteractionHandle();
    InteractionManager.clearInteractionHandle(handle);
    startSub.remove();
    completeSub.remove();

    expect(started).toBe(1);
    expect(completed).toBe(1);
  });
});
