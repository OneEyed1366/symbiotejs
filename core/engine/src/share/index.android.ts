// Share (Android build). The native module is `ShareModule`:
// `share(content, dialogTitle?) -> Promise<{ action }>`. We validate content, build the
// content dict (title/message), forward the dialog title, and map the resolved action
// onto the shared IShareAction shape; Android has no dismiss path, so RN fills the
// missing activityType with null. Metro picks this file on an Android host. See ADR 0019.
//
// device-verify-pending: the `ShareModule` name matches NativeShareModule's
// TurboModuleRegistry.get('ShareModule') from RN source, but headless fakes resolve any
// name, so it is only proven on a real Android host (a bridgeless resolution log there).
// See .docs/native-module-platform-routing.md, ADR 0012.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';
import { validateContent, shareActions, SHARED_ACTION, DISMISSED_ACTION } from './shared';
import type { IShareContent, IShareOptions, IShareAction, IShareStatic } from './shared';

export type { IShareContent, IShareOptions, IShareAction } from './shared';

const SHARE_MODULE = 'ShareModule';

// The Android ShareModule contract, from NativeShareModule's spec: share takes a content
// dict (title/message) plus the dialog title and resolves { action }. Single trust-
// boundary point (no per-call `as`; the generic on getNativeModule carries it).
interface IShareModuleAndroid {
  share(
    content: { title?: string; message?: string },
    dialogTitle?: string,
  ): Promise<{ action: string }>;
}

// ShareModule.share resolves an untyped value at the native boundary; narrow it before
// reading `action` (no `as`).
function isShareResult(value: unknown): value is { action: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'action' in value &&
    typeof value.action === 'string'
  );
}

export const Share: IShareStatic = {
  ...shareActions,
  // Open the Android share dialog for `content`. Resolves with the user's action
  // (Android always resolves sharedAction); rejects on invalid content, an unexpected
  // native result, or a missing module (explicit reject, never a hung Promise).
  share(content: IShareContent, options: IShareOptions = {}): Promise<IShareAction> {
    const invalid = validateContent(content);
    if (invalid !== null) {
      dlog(`Share.share -> invalid content: ${invalid.message}`);
      return Promise.reject(invalid);
    }
    dlog('Share.share (android)');
    const shareModule = getNativeModule<IShareModuleAndroid>(SHARE_MODULE);
    if (shareModule === null) {
      dlog(`Share: "${SHARE_MODULE}" unresolved`);
      return Promise.reject(new Error('Share: ShareModule native module unavailable'));
    }
    const newContent = {
      title: content.title,
      message: typeof content.message === 'string' ? content.message : undefined,
    };
    return shareModule.share(newContent, options.dialogTitle).then(result => {
      if (!isShareResult(result)) {
        dlog('Share.share -> android result missing action');
        throw new Error('Share: ShareModule returned an unexpected result');
      }
      dlog(`Share.share -> android action=${result.action}`);
      return {
        action: result.action === DISMISSED_ACTION ? DISMISSED_ACTION : SHARED_ACTION,
        activityType: null,
      };
    });
  },
};
