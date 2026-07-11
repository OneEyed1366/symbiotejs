// Unit test for the Share module: JS->native only. The platform builds are separate files
// (share/index.ios.ts / share/index.android.ts), imported DIRECTLY. The native module is
// platform-specific: the iOS build drives
// ActionSheetManager.showShareActionSheetWithOptions (there is NO ShareModule on iOS); the
// Android build drives ShareModule.share.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IShareContent } from './index.android';

const SHARED_ACTIVITY = 'com.apple.UIKit.activity.PostToTwitter';

let iosShare: typeof import('./index.ios').Share;
let androidShare: typeof import('./index.android').Share;

// `completeNextShare` decides which iOS callback path runs; each test flips it as needed.
let completeNextShare: boolean;
let lastAndroidShare: {
  content: { title?: string; message?: string };
  dialogTitle?: string;
} | null;
let lastActionSheetOptions: Record<string, unknown> | null;
let registeredModuleNames: string[];

beforeEach(async () => {
  completeNextShare = true;
  lastAndroidShare = null;
  lastActionSheetOptions = null;

  const fakeActionSheetManager = {
    showShareActionSheetWithOptions: (
      options: Record<string, unknown>,
      _failureCallback: (error: { message: string }) => void,
      successCallback: (completed: boolean, activityType?: string) => void,
    ): void => {
      lastActionSheetOptions = options;
      successCallback(completeNextShare, completeNextShare ? SHARED_ACTIVITY : undefined);
    },
  };

  const fakeShareModule = {
    share: (
      content: { title?: string; message?: string },
      dialogTitle?: string,
    ): Promise<{ action: string }> => {
      lastAndroidShare = { content, dialogTitle };
      return Promise.resolve({ action: 'sharedAction' });
    },
  };

  const registeredModules: Record<string, unknown> = {
    ActionSheetManager: fakeActionSheetManager,
    ShareModule: fakeShareModule,
  };

  registeredModuleNames = [];
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    registeredModuleNames.push(name);
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };

  vi.resetModules();
  ({ Share: iosShare } = await import('./index.ios'));
  ({ Share: androidShare } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Share action constants', () => {
  it('both builds expose dismissedAction / sharedAction', () => {
    expect(iosShare.dismissedAction).toBe('dismissedAction');
    expect(iosShare.sharedAction).toBe('sharedAction');
    expect(androidShare.dismissedAction).toBe('dismissedAction');
    expect(androidShare.sharedAction).toBe('sharedAction');
  });
});

describe('Share (iOS build -> ActionSheetManager)', () => {
  it('a completed share resolves { action: sharedAction, activityType }', async () => {
    completeNextShare = true;
    const shared = await iosShare.share({ message: 'hi', url: 'https://x' });
    expect(shared.action).toBe('sharedAction');
    expect(shared.activityType).toBe(SHARED_ACTIVITY);
  });

  it('a dismissed share resolves dismissedAction', async () => {
    completeNextShare = false;
    const dismissed = await iosShare.share({ message: 'hi' });
    expect(dismissed.action).toBe('dismissedAction');
  });

  it('content with neither message nor url rejects', async () => {
    // JSON.parse yields an untyped value so the deliberately-invalid shape needs no cast.
    const invalidContent: IShareContent = JSON.parse('{"title":"only a title"}');
    await expect(iosShare.share(invalidContent)).rejects.toBeDefined();
  });

  // Regression net for the action-sheet-ios/share contract merge: Share must keep resolving
  // through the exact SAME native module name that action-sheet-ios owns, and must still
  // invoke showShareActionSheetWithOptions with the options Share builds - proving the merged
  // INativeActionSheetManager type (imported from ../action-sheet-ios) didn't change behavior.
  it('resolves through the ActionSheetManager module and invokes showShareActionSheetWithOptions with the built options', async () => {
    await iosShare.share({ message: 'hi', url: 'https://x' }, { subject: 'subj' });

    expect(registeredModuleNames).toContain('ActionSheetManager');
    expect(lastActionSheetOptions).not.toBeNull();
    expect(lastActionSheetOptions?.message).toBe('hi');
    expect(lastActionSheetOptions?.url).toBe('https://x');
    expect(lastActionSheetOptions?.subject).toBe('subj');
  });
});

describe('Share (Android build -> ShareModule)', () => {
  it('forwards content + dialogTitle and maps the result to activityType: null', async () => {
    const androidResult = await androidShare.share(
      { title: 'T', message: 'body' },
      { dialogTitle: 'Pick one' },
    );
    expect(androidResult.action).toBe('sharedAction');
    expect(androidResult.activityType).toBeNull();
    expect(lastAndroidShare).not.toBeNull();
    expect(lastAndroidShare?.content.message).toBe('body');
    expect(lastAndroidShare?.content.title).toBe('T');
    expect(lastAndroidShare?.dialogTitle).toBe('Pick one');
  });
});
