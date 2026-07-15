// Pure folds from a route's agnostic IScreenOptions into the native view-props shapes
// (RNSScreen + RNSScreenStackHeaderConfig + RNSSearchBar paint from). Framework-agnostic and
// shared verbatim by every adapter - the adapter's own job is only wiring identity (screenId),
// position (activityState via computeActivityState) and the lifecycle event handlers into
// `passthrough`.
//
// The header bar-button payload+dispatch cluster (id-tagging, onPress lookup) lives in
// header-bar-buttons.ts - self-contained, consumed here only as a black box by
// resolveHeaderConfigView.

import type {
  IHeaderConfigViewProps,
  INavigatorPlatform,
  IOptionalBooleanNativeProp,
  IScreenOptions,
  IScreenViewProps,
  ISearchBarOptions,
  ISearchBarViewProps,
  ISheetAllowedDetents,
  ISheetInitialDetent,
  ISheetLargestUndimmedDetent,
} from './navigator-props';
import { buildHeaderBarButtonDispatch, prepareHeaderBarButtonItems } from './header-bar-buttons';

// These sentinels must be kept in sync with react-native-screens' native side - they are RNS's
// own compat values for the 'fitToContents'/'large'/'medium'/'all' legacy presets, replicated
// here because we drive RNSScreen directly (no react-native-screens JS component in the path).
const SHEET_FIT_TO_CONTENTS: number[] = [-1];
const SHEET_COMPAT_LARGE: number[] = [1.0];
const SHEET_COMPAT_MEDIUM: number[] = [0.5];
const SHEET_COMPAT_ALL: number[] = [0.5, 1.0];
const SHEET_DIMMED_ALWAYS = -1;

function resolveSheetAllowedDetents(compat: ISheetAllowedDetents | undefined): number[] {
  if (compat === undefined) return SHEET_COMPAT_LARGE;
  if (Array.isArray(compat)) return compat;
  switch (compat) {
    case 'fitToContents':
      return SHEET_FIT_TO_CONTENTS;
    case 'large':
      return SHEET_COMPAT_LARGE;
    case 'medium':
      return SHEET_COMPAT_MEDIUM;
    case 'all':
      return SHEET_COMPAT_ALL;
  }
}

function resolveSheetLargestUndimmedDetent(
  compat: ISheetLargestUndimmedDetent | undefined,
  lastDetentIndex: number,
): number {
  if (typeof compat === 'number') return compat;
  switch (compat) {
    case 'last':
      return lastDetentIndex;
    case 'large':
      return 1;
    case 'medium':
      return 0;
    case 'none':
    case 'all':
    case undefined:
      return SHEET_DIMMED_ALWAYS;
  }
}

function resolveSheetInitialDetent(
  compat: ISheetInitialDetent | undefined,
  lastDetentIndex: number,
): number {
  if (compat === 'last') return lastDetentIndex;
  if (compat === undefined) return 0;
  return compat;
}

function toOptionalBooleanNativeProp(value: boolean | undefined): IOptionalBooleanNativeProp {
  if (value === undefined) return 'undefined';
  return value ? 'true' : 'false';
}

export function resolveHeaderConfigView(
  options: IScreenOptions | undefined,
  platform: INavigatorPlatform,
  passthrough: Record<string, unknown> = {},
): IHeaderConfigViewProps {
  return {
    title: options?.title,
    hidden: options?.headerShown === false,
    backTitle: options?.headerBackTitle,
    backTitleVisible: platform.defaultHeaderBackTitleVisible,
    backButtonDisplayMode: options?.headerBackButtonDisplayMode,
    largeTitle: options?.headerLargeTitle,
    translucent: options?.headerTranslucent,
    color: options?.headerTintColor,
    titleColor: options?.headerTitleColor,
    backgroundColor: options?.headerStyle?.backgroundColor,
    largeTitleBackgroundColor: options?.headerLargeStyle?.backgroundColor,
    userInterfaceStyle: options?.headerUserInterfaceStyle,
    headerLeftBarButtonItems: prepareHeaderBarButtonItems(
      options?.headerLeftBarButtonItems,
      'left',
    ),
    headerRightBarButtonItems: prepareHeaderBarButtonItems(
      options?.headerRightBarButtonItems,
      'right',
    ),
    ...buildHeaderBarButtonDispatch(
      options?.headerLeftBarButtonItems,
      options?.headerRightBarButtonItems,
    ),
    passthrough,
  };
}

export function resolveScreenView(
  screenId: string,
  activityState: number,
  options: IScreenOptions | undefined,
  passthrough: Record<string, unknown> = {},
): IScreenViewProps {
  const sheetAllowedDetents = resolveSheetAllowedDetents(options?.sheetAllowedDetents);
  const lastDetentIndex = sheetAllowedDetents.length - 1;
  return {
    screenId,
    activityState,
    gestureEnabled: options?.gestureEnabled,
    stackAnimation: options?.stackAnimation,
    stackPresentation: options?.stackPresentation,
    transitionDuration: options?.transitionDuration,
    sheetAllowedDetents,
    sheetLargestUndimmedDetent: resolveSheetLargestUndimmedDetent(
      options?.sheetLargestUndimmedDetentIndex,
      lastDetentIndex,
    ),
    sheetInitialDetent: resolveSheetInitialDetent(
      options?.sheetInitialDetentIndex,
      lastDetentIndex,
    ),
    sheetGrabberVisible: options?.sheetGrabberVisible,
    sheetCornerRadius: options?.sheetCornerRadius,
    sheetExpandsWhenScrolledToEdge: options?.sheetExpandsWhenScrolledToEdge,
    sheetElevation: options?.sheetElevation,
    sheetShouldOverflowTopInset: options?.sheetShouldOverflowTopInset,
    sheetDefaultResizeAnimationEnabled: options?.sheetDefaultResizeAnimationEnabled,
    statusBarStyle: options?.statusBarStyle,
    statusBarHidden: options?.statusBarHidden,
    statusBarAnimation: options?.statusBarAnimation,
    screenOrientation: options?.screenOrientation,
    passthrough,
  };
}

// RNSSearchBar is a standalone Fabric leaf (react-native-screens mounts it as a header-subview
// child in its own JS component) - resolveSearchBarView only folds the static config surface;
// where/how the adapter mounts the resulting leaf in the header tree is an adapter concern.
export function resolveSearchBarView(
  options: ISearchBarOptions | undefined,
  passthrough: Record<string, unknown> = {},
): ISearchBarViewProps {
  return {
    placeholder: options?.placeholder,
    autoCapitalize: options?.autoCapitalize,
    placement: options?.placement,
    hideWhenScrolling: options?.hideWhenScrolling,
    allowToolbarIntegration: options?.allowToolbarIntegration,
    obscureBackground: toOptionalBooleanNativeProp(options?.obscureBackground),
    hideNavigationBar: toOptionalBooleanNativeProp(options?.hideNavigationBar),
    cancelButtonText: options?.cancelButtonText,
    barTintColor: options?.barTintColor,
    tintColor: options?.tintColor,
    textColor: options?.textColor,
    autoFocus: options?.autoFocus,
    disableBackButtonOverride: options?.disableBackButtonOverride,
    inputType: options?.inputType,
    hintTextColor: options?.hintTextColor,
    headerIconColor: options?.headerIconColor,
    shouldShowHintSearchIcon: options?.shouldShowHintSearchIcon,
    passthrough,
  };
}
