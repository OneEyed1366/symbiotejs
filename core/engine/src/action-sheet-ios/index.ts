// ActionSheetIOS: a JS->native imperative module, no Fabric view, no React. It
// drives the `ActionSheetManager` native module: `showActionSheetWithOptions`
// passes options straight through and the native `callback(buttonIndex)` reports
// the tapped row. We mirror RN faithfully.
//
// The native contract is confirmed from RN's TurboModule spec for
// `INativeActionSheetManager`:
//   showActionSheetWithOptions(options, callback: (buttonIndex: number) => void)
//   showShareActionSheetWithOptions(options, failureCallback, successCallback)
//   dismissActionSheet?()
//
// iOS only. Non-throwing, like StatusBar: a missing native module is a no-op,
// never a crash (on a device the module may be absent).
//
// Color note: RN runs `tintColor` / `cancelButtonTintColor` / `titleTextColor`
// through processColor before handing them to native. symbiote centralizes color
// processing in @symbiote-native/engine, so we do NOT process colors here; options pass
// through untouched. The canary needs no colors; revisit when wiring real colors.

import { dlog } from '../debug';
import { getNativeModule } from '../native-modules';

export const ACTION_SHEET_MANAGER = 'ActionSheetManager';

export interface IActionSheetIOSOptions {
  title?: string;
  message?: string;
  options: string[];
  // Both forms are accepted from app code: the legacy single index (normalized away
  // before the native call) and the explicit array RN's native side actually consumes.
  destructiveButtonIndex?: number | number[];
  destructiveButtonIndices?: number[];
  cancelButtonIndex?: number;
  anchor?: number;
  // Colors are NOT processed here (see file header); passed through as given.
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
  userInterfaceStyle?: string;
  disabledButtonIndices?: number[];
}

export interface IShareActionSheetIOSOptions {
  message?: string;
  url?: string;
  subject?: string;
  anchor?: number;
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
  excludedActivityTypes?: string[];
  userInterfaceStyle?: string;
}

export interface IShareActionSheetError {
  domain: string;
  code: string;
  userInfo?: Record<string, unknown>;
  message: string;
}

// The native module typed as the interface we vouch for. Single trust-boundary
// point (no per-call `as`); the generic on getNativeModule carries it. The
// callback `buttonIndex`/`completed`/`activityType` arrive typed because we
// declare them here. This is the sole owner of the ActionSheetManager contract -
// Share (share/index.ios.ts) imports this interface rather than redeclaring its
// own narrower view onto the same native module.
export interface INativeActionSheetManager {
  showActionSheetWithOptions(
    options: IActionSheetIOSOptions,
    callback: (buttonIndex: number) => void,
  ): void;
  showShareActionSheetWithOptions(
    options: IShareActionSheetIOSOptions,
    failureCallback: (error: IShareActionSheetError) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void;
  dismissActionSheet?(): void;
}

// The static imperative API RN exposes, mirrored as a static-method object.
export const ActionSheetIOS = {
  showActionSheetWithOptions(
    options: IActionSheetIOSOptions,
    callback: (buttonIndex: number) => void,
  ): void {
    dlog('ActionSheetIOS.showActionSheetWithOptions');
    const manager = getNativeModule<INativeActionSheetManager>(ACTION_SHEET_MANAGER);
    if (manager === null) {
      dlog(`ActionSheetIOS: "${ACTION_SHEET_MANAGER}" unresolved — no-op`);
      return;
    }
    // Normalize the single-index legacy form to the array RN's native side expects
    // (RN ActionSheetIOS.js ~95-101): a `destructiveButtonIndex: number` becomes
    // `destructiveButtonIndices: [number]`; an existing array passes through. Without
    // this the destructive row isn't highlighted on a real iOS host. Colors are still
    // not processed here (see file header).
    const { destructiveButtonIndex, ...remainingOptions } = options;
    let destructiveButtonIndices = options.destructiveButtonIndices;
    if (Array.isArray(destructiveButtonIndex)) {
      destructiveButtonIndices = destructiveButtonIndex;
    } else if (typeof destructiveButtonIndex === 'number') {
      destructiveButtonIndices = [destructiveButtonIndex];
    }
    const nativeOptions: IActionSheetIOSOptions = { ...remainingOptions, destructiveButtonIndices };
    manager.showActionSheetWithOptions(nativeOptions, buttonIndex => {
      dlog(`ActionSheetIOS callback buttonIndex=${buttonIndex}`);
      callback(buttonIndex);
    });
  },

  showShareActionSheetWithOptions(
    options: IShareActionSheetIOSOptions,
    failureCallback: (error: IShareActionSheetError) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void {
    dlog('ActionSheetIOS.showShareActionSheetWithOptions');
    const manager = getNativeModule<INativeActionSheetManager>(ACTION_SHEET_MANAGER);
    if (manager === null) {
      dlog(`ActionSheetIOS: "${ACTION_SHEET_MANAGER}" unresolved — no-op`);
      return;
    }
    manager.showShareActionSheetWithOptions(
      options,
      error => {
        dlog('ActionSheetIOS share failure callback');
        failureCallback(error);
      },
      (completed, activityType) => {
        dlog(`ActionSheetIOS share success completed=${completed}`);
        successCallback(completed, activityType);
      },
    );
  },

  dismissActionSheet(): void {
    dlog('ActionSheetIOS.dismissActionSheet');
    const manager = getNativeModule<INativeActionSheetManager>(ACTION_SHEET_MANAGER);
    if (manager === null) {
      dlog(`ActionSheetIOS: "${ACTION_SHEET_MANAGER}" unresolved — no-op`);
      return;
    }
    manager.dismissActionSheet?.();
  },
};
