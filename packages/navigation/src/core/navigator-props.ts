// Navigator prop types. Per CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>: screen
// options (title, header styling, transition/presentation) are entirely scalar/color-typed, so
// they live here as the shared agnostic base every adapter re-exports. The Stack/Screen PUBLIC
// component props are NOT here - they carry framework children (the screen content) and a
// framework ref (the navigator handle), so each adapter declares its own flavored type over
// this base, same split as IPressableProps.

import type { IColorValue, ISymbioteEvent } from '@symbiote-native/engine';
import type { IImageSourceProp } from '@symbiote-native/components';

export type IStackAnimation =
  | 'default'
  | 'flip'
  | 'simple_push'
  | 'none'
  | 'fade'
  | 'slide_from_right'
  | 'slide_from_left'
  | 'slide_from_bottom'
  | 'fade_from_bottom'
  | 'ios_from_right'
  | 'ios_from_left';

export type IStackPresentation =
  | 'push'
  | 'modal'
  | 'transparentModal'
  | 'fullScreenModal'
  | 'formSheet'
  | 'pageSheet'
  | 'containedModal'
  | 'containedTransparentModal';

export type IHeaderBackButtonDisplayMode = 'minimal' | 'default' | 'generic';

// react-native-screens' native chrome (the nav bar's blur/vibrancy, and - critically - an
// embedded headerSearchBarOptions search field's own backdrop) follows this OS-level trait
// rather than our individual color props; left 'unspecified', it inherits the SYSTEM appearance
// regardless of app theme, which is why a search bar on an otherwise all-dark screen still shows
// a stray light backdrop even with every color prop set. 'dark'/'light' force the whole header
// (and any embedded search bar) into that appearance outright.
export type IHeaderUserInterfaceStyle = 'unspecified' | 'light' | 'dark';

// A 3-state native boolean (RNSSearchBar's `obscureBackground`/`hideNavigationBar`): the legacy
// (Paper) architecture can't diff a `WithDefault<boolean>` against "unset" the way Fabric can, so
// react-native-screens' own codegen spec models these two props as this string enum instead of a
// plain optional boolean.
export type IOptionalBooleanNativeProp = 'undefined' | 'false' | 'true';

// RNSScreen's real sheet-detent surface (`formSheet`/`pageSheet` presentation). The compat union
// mirrors react-native-screens' own ScreenProps['sheetAllowedDetents'] - a plain fraction array,
// sorted ascending, or one of RNS's named presets; the fold to the native `sheetAllowedDetents:
// number[]` array happens in screen-options.ts, replicating RNS's own resolveSheetAllowedDetents.
export type ISheetAllowedDetents = number[] | 'fitToContents' | 'large' | 'medium' | 'all';
export type ISheetLargestUndimmedDetent = number | 'last' | 'none' | 'all' | 'large' | 'medium';
export type ISheetInitialDetent = number | 'last';

// A bar-button item's icon: SF Symbol / iOS asset-catalog name, or an image asset. Mirrors RNS's
// PlatformIconIOS union - the only icon shape RNSScreenStackHeaderConfig's bar-button items
// accept; there is no Android equivalent in the codegen spec (header bar-button items are iOS-only
// native surface).
export type IHeaderBarButtonIcon =
  | { type: 'sfSymbol'; name: string }
  | { type: 'xcasset'; name: string }
  | { type: 'imageSource'; imageSource: IImageSourceProp }
  | { type: 'templateSource'; templateSource: IImageSourceProp };

export type IHeaderBarButtonItemBadge = {
  value: string;
  style?: {
    color?: IColorValue;
    backgroundColor?: IColorValue;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
  };
};

type ISharedHeaderBarButtonItem = {
  index?: number;
  title?: string;
  titleStyle?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: IColorValue;
  };
  icon?: IHeaderBarButtonIcon;
  variant?: 'plain' | 'done' | 'prominent';
  tintColor?: IColorValue;
  disabled?: boolean;
  width?: number;
  hidesSharedBackground?: boolean;
  sharesBackground?: boolean;
  identifier?: string;
  badge?: IHeaderBarButtonItemBadge;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export type IHeaderBarButtonItemAction = ISharedHeaderBarButtonItem & {
  type: 'button';
  onPress: () => void;
  selected?: boolean;
};

export type IHeaderBarButtonMenuAction = {
  type: 'action';
  title?: string;
  subtitle?: string;
  onPress: () => void;
  icon?: IHeaderBarButtonIcon;
  state?: 'on' | 'off' | 'mixed';
  disabled?: boolean;
  destructive?: boolean;
  hidden?: boolean;
  keepsMenuPresented?: boolean;
  discoverabilityLabel?: string;
};

export type IHeaderBarButtonSubmenu = {
  type: 'submenu';
  title?: string;
  icon?: IHeaderBarButtonIcon;
  items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[];
  displayInline?: boolean;
  destructive?: boolean;
  singleSelection?: boolean;
  displayAsPalette?: boolean;
};

export type IHeaderBarButtonItemMenu = ISharedHeaderBarButtonItem & {
  type: 'menu';
  menu: {
    title?: string;
    items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[];
    singleSelection?: boolean;
    displayAsPalette?: boolean;
  };
  changesSelectionAsPrimaryAction?: boolean;
};

export type IHeaderBarButtonItemSpacing = { type: 'spacing'; spacing: number };

export type IHeaderBarButtonItem =
  IHeaderBarButtonItemAction | IHeaderBarButtonItemMenu | IHeaderBarButtonItemSpacing;

export type ISearchBarAutoCapitalize =
  'systemDefault' | 'none' | 'words' | 'sentences' | 'characters';

export type ISearchBarPlacement =
  'automatic' | 'inline' | 'stacked' | 'integrated' | 'integratedButton' | 'integratedCentered';

// RNSSearchBar's full static config surface plus every event callback react-native-screens'
// own SearchBarProps exposes (types.tsx): onChangeText/onSearchButtonPress carry the current
// text, the rest are plain notifications. onClose/onOpen are Android-only upstream. The
// imperative ref (focus/blur/clearText/setText/cancelSearch/toggleCancelButton) is NOT here -
// it carries a framework ref type, so it is per-adapter (see react/screen.ts's
// IReactSearchBarOptions), same split as IPressableProps' children/ref fields.
export type ISearchBarOptions = {
  placeholder?: string;
  autoCapitalize?: ISearchBarAutoCapitalize;
  placement?: ISearchBarPlacement;
  hideWhenScrolling?: boolean;
  allowToolbarIntegration?: boolean;
  obscureBackground?: boolean;
  hideNavigationBar?: boolean;
  cancelButtonText?: string;
  barTintColor?: IColorValue;
  tintColor?: IColorValue;
  textColor?: IColorValue;
  autoFocus?: boolean;
  disableBackButtonOverride?: boolean;
  inputType?: string;
  hintTextColor?: IColorValue;
  headerIconColor?: IColorValue;
  shouldShowHintSearchIcon?: boolean;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onCancelButtonPress?: () => void;
  onSearchButtonPress?: (text: string) => void;
  // Android only, per react-native-screens' own SearchBarProps comment.
  onClose?: () => void;
  onOpen?: () => void;
};

export type IScreenOrientation =
  | 'default'
  | 'all'
  | 'portrait'
  | 'portrait_up'
  | 'portrait_down'
  | 'landscape'
  | 'landscape_left'
  | 'landscape_right';

// The agnostic per-screen options surface: header title/appearance, transition tuning, sheet
// detents (formSheet/pageSheet), header bar-button items, the search bar, and the
// translucent/status-bar family. The gamma-line stack host remains deferred - see packages/
// navigation's README for the explicit split. `headerSearchBarOptions` folds through
// resolveSearchBarView/resolveSearchBarProps into a SEPARATE RNSSearchBar leaf, not into this
// record's own native view - see render-stack.ts.
export interface IScreenOptions {
  title?: string;
  headerShown?: boolean;
  headerTitleColor?: IColorValue;
  headerStyle?: { backgroundColor?: IColorValue };
  headerTintColor?: IColorValue;
  headerBackTitle?: string;
  headerBackButtonDisplayMode?: IHeaderBackButtonDisplayMode;
  headerLargeTitle?: boolean;
  // react-native-screens tracks the large-title (scroll-edge) appearance SEPARATELY from the
  // compact/collapsed one - headerStyle.backgroundColor only colors the latter. Left unset with
  // headerLargeTitle: true, the expanded state falls back to the system default (white), which
  // reads as a stray white band against a dark theme. Naming mirrors @react-navigation/
  // native-stack's own headerLargeStyle for the same prop.
  headerLargeStyle?: { backgroundColor?: IColorValue };
  headerUserInterfaceStyle?: IHeaderUserInterfaceStyle;
  headerTranslucent?: boolean;
  headerLeftBarButtonItems?: IHeaderBarButtonItem[];
  headerRightBarButtonItems?: IHeaderBarButtonItem[];
  headerSearchBarOptions?: ISearchBarOptions;
  gestureEnabled?: boolean;
  stackAnimation?: IStackAnimation;
  stackPresentation?: IStackPresentation;
  transitionDuration?: number;
  sheetAllowedDetents?: ISheetAllowedDetents;
  sheetLargestUndimmedDetentIndex?: ISheetLargestUndimmedDetent;
  sheetInitialDetentIndex?: ISheetInitialDetent;
  sheetGrabberVisible?: boolean;
  sheetCornerRadius?: number;
  sheetExpandsWhenScrolledToEdge?: boolean;
  sheetElevation?: number;
  sheetShouldOverflowTopInset?: boolean;
  sheetDefaultResizeAnimationEnabled?: boolean;
  statusBarStyle?: 'inverted' | 'auto' | 'light' | 'dark';
  statusBarHidden?: boolean;
  statusBarAnimation?: 'none' | 'fade' | 'slide';
  screenOrientation?: IScreenOrientation;
}

// The per-platform piece the render needs, matching ISliderPlatform's shape: a default header
// tint the host platform normally applies natively, kept explicit here so the render stays
// platform-invariant (no Platform.OS read in core).
export type INavigatorPlatform = {
  defaultHeaderBackTitleVisible: boolean;
};

// Pre-resolved inputs the RNSScreen native render paints from. Only fields the fold actually
// computes are explicit (screenId, activityState, the resolved options); everything else - the
// native lifecycle/back-button event handlers - rides in `passthrough`, same convention as
// ISliderViewProps.
export type IScreenViewProps = {
  screenId: string;
  activityState: number;
  gestureEnabled?: boolean;
  stackAnimation?: IStackAnimation;
  stackPresentation?: IStackPresentation;
  transitionDuration?: number;
  sheetAllowedDetents?: number[];
  sheetLargestUndimmedDetent?: number;
  sheetInitialDetent?: number;
  sheetGrabberVisible?: boolean;
  sheetCornerRadius?: number;
  sheetExpandsWhenScrolledToEdge?: boolean;
  sheetElevation?: number;
  sheetShouldOverflowTopInset?: boolean;
  sheetDefaultResizeAnimationEnabled?: boolean;
  statusBarStyle?: 'inverted' | 'auto' | 'light' | 'dark';
  statusBarHidden?: boolean;
  statusBarAnimation?: 'none' | 'fade' | 'slide';
  screenOrientation?: IScreenOrientation;
  passthrough: Record<string, unknown>;
};

export type IHeaderConfigViewProps = {
  title?: string;
  hidden: boolean;
  backTitle?: string;
  backTitleVisible: boolean;
  backButtonDisplayMode?: IHeaderBackButtonDisplayMode;
  largeTitle?: boolean;
  translucent?: boolean;
  color?: IColorValue;
  titleColor?: IColorValue;
  backgroundColor?: IColorValue;
  largeTitleBackgroundColor?: IColorValue;
  userInterfaceStyle?: IHeaderUserInterfaceStyle;
  // Already native-shaped (buttonId/menuId-tagged, colors run through processColor) - the fold
  // that builds these lives in header-bar-buttons.ts, mirroring RNS's own prepareHeaderBarButtonItems.
  headerLeftBarButtonItems?: unknown[];
  headerRightBarButtonItems?: unknown[];
  onPressHeaderBarButtonItem?: (event: ISymbioteEvent) => void;
  onPressHeaderBarButtonMenuItem?: (event: ISymbioteEvent) => void;
  passthrough: Record<string, unknown>;
};

export type IStackViewProps = {
  passthrough: Record<string, unknown>;
};

// Pre-resolved inputs the RNSSearchBar native leaf paints from, mirroring IScreenViewProps'
// shape: derived from ISearchBarOptions since every static config field is identical - only the
// two boolean fields the native prop processor needs to see resolved (obscureBackground/
// hideNavigationBar) and the event callbacks (which ride in `passthrough`, adapter-supplied,
// instead of being called directly here) differ.
export type ISearchBarViewProps = Omit<
  ISearchBarOptions,
  | 'obscureBackground'
  | 'hideNavigationBar'
  | 'onChangeText'
  | 'onFocus'
  | 'onBlur'
  | 'onCancelButtonPress'
  | 'onSearchButtonPress'
  | 'onClose'
  | 'onOpen'
> & {
  obscureBackground?: IOptionalBooleanNativeProp;
  hideNavigationBar?: IOptionalBooleanNativeProp;
  passthrough: Record<string, unknown>;
};
