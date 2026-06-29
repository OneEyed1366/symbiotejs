// Co-located unit test (ADR 0025) for the ActionSheetIOS imperative module. A fake
// ActionSheetManager native module records the options it receives and invokes the callback
// with buttonIndex 1.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ICapturedOptions {
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number | number[];
  destructiveButtonIndices?: number[];
}

let ActionSheetIOS: typeof import('./index').ActionSheetIOS;

let captured: ICapturedOptions | null;

beforeEach(async () => {
  captured = null;

  const fakeActionSheetManager = {
    showActionSheetWithOptions(
      options: ICapturedOptions,
      callback: (buttonIndex: number) => void,
    ): void {
      captured = options;
      // Simulate the user tapping row index 1.
      callback(1);
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === 'ActionSheetManager' && isPresent<T>(fakeActionSheetManager)
      ? fakeActionSheetManager
      : null;

  vi.resetModules();
  ({ ActionSheetIOS } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('ActionSheetIOS', () => {
  it('passes options through, normalizes destructiveButtonIndex, and delivers the chosen index', () => {
    let chosen = -1;
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['A', 'B', 'Cancel'], cancelButtonIndex: 2, destructiveButtonIndex: 1 },
      idx => {
        chosen = idx;
      },
    );

    expect(captured).not.toBeNull();
    // Options + cancelButtonIndex pass straight through to native.
    expect(captured?.options).toEqual(['A', 'B', 'Cancel']);
    expect(captured?.cancelButtonIndex).toBe(2);
    // A single destructiveButtonIndex normalizes to destructiveButtonIndices: [n].
    expect(captured?.destructiveButtonIndex).toBeUndefined();
    expect(captured?.destructiveButtonIndices).toEqual([1]);
    // The callback delivers the chosen index back to JS.
    expect(chosen).toBe(1);
  });
});
