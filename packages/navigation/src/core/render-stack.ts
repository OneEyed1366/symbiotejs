// Navigator: framework-agnostic render half. A screen's content is an arbitrary framework
// subtree the adapter owns (unlike the slider's one native leaf), so these resolvers hand back
// plain props objects for the RNSScreen/RNSScreenStack leaves the adapter builds itself with real
// children, and one full Descriptor for the header config. The header config Descriptor never
// takes framework children (headerLeftBarButtonItems/headerRightBarButtonItems are native config
// arrays from screen-options.ts, not elements), but can nest one RNSSearchBar leaf wrapped in an
// RNSScreenStackHeaderSubview(type: 'searchBar'), matching how react-native-screens' own
// ScreenStackHeaderSearchBarView mounts it. RNSScreenStackHeaderConfig.mm's mountChildComponentView
// rejects a bare RNSSearchBar child natively ("only accepts children of type
// ScreenStackHeaderSubview") and reads the search bar back out via `subview.subviews[0]`.

import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  HEADER_ON_PRESS_BAR_BUTTON_ITEM,
  HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM,
  RNS_MODAL_SCREEN_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  RNS_SEARCH_BAR_VIEW_NAME,
  SEARCH_BAR_ON_BLUR,
  SEARCH_BAR_ON_CANCEL_BUTTON_PRESS,
  SEARCH_BAR_ON_CHANGE_TEXT,
  SEARCH_BAR_ON_CLOSE,
  SEARCH_BAR_ON_FOCUS,
  SEARCH_BAR_ON_OPEN,
  SEARCH_BAR_ON_SEARCH_BUTTON_PRESS,
  STACK_DEFAULT_ANIMATION,
  STACK_DEFAULT_PRESENTATION,
} from './constants';
import { computeActivityState } from './navigator-state';
import type {
  IHeaderConfigViewProps,
  INavigatorPlatform,
  IScreenOptions,
  IScreenViewProps,
  ISearchBarOptions,
  ISearchBarViewProps,
  IStackPresentation,
  IStackViewProps,
} from './navigator-props';
import { resolveHeaderConfigView, resolveScreenView, resolveSearchBarView } from './screen-options';

// Mirrors react-native-screens' ScreenStackItem.tsx (getPositioningStyle): a formSheet's content
// wrapper does not get `flex: 1`. RNSScreen.mm's updateBounds pushes the sheet's live native size
// into Fabric's shadow state on every frame of a detent drag, and a `bottom: 0`-pinned wrapper
// forces React to set a strict frame on every update, causing the flicker PR #1870 fixed by
// switching to `absoluteWithNoBottom` (RNSScreen.mm: "we do not set bottom: 0 in JS for wrapper of
// the screen content, causing React to not set strict frame every time the sheet size is updated").
// Tradeoff: content shorter than the sheet's current detent leaves a gap below it.
// RNSScreenContentWrapper.mm's coerceChildScrollViewComponentSizeToSize fixes that natively, but
// only for a ScrollView child, which it resizes directly to the sheet's real frame bypassing
// Yoga/flex, not something reachable from a style choice here.
const SCREEN_CONTENT_WRAPPER_FLEX_STYLE = { flex: 1 };
const SHEET_CONTENT_WRAPPER_STYLE = {
  position: 'absolute',
  top: 0,
  start: 0,
  end: 0,
  bottom: undefined,
};

// Android's native header (react-native-screens' CustomToolbar in a CoordinatorLayout alongside
// an AppBarLayout) auto-offsets screen content below the header via a Material
// `AppBarLayout.ScrollingViewBehavior` (ScreenStackFragment.kt's setToolbarTranslucent: `behavior
// = if (translucent) null else ScrollingViewBehavior()`). A plain (non-translucent) header gets
// this offset for free and needs no JS compensation. `headerTranslucent: true` removes that
// behavior: react-native-screens' contract for translucent is "background goes away AND content
// is no longer auto-pushed below it", meant for a screen painting under a see-through header. An
// app that sets headerTranslucent just for a custom (still opaque) header look, while relying on
// its own SafeAreaView for safe-area content, loses the free offset and gets clipped:
// SafeAreaView's Android inset only reflects WindowInsetsCompat's systemBars() (status
// bar/cutout), with no awareness of the sibling Toolbar, so content paints its first 56dp under
// the header. Verified empirically (2026-07-10) via `adb shell uiautomator dump`: a
// translucent-header screen's content measured starting at y=0 (see the
// navigation-header-content-offset skill for the full incident). iOS's UINavigationController
// already lays out below its real nav bar regardless of translucency, so this compensation is
// Android-only and applies only when translucent (a non-translucent header already gets the
// native offset; padding there would double it).
const ANDROID_HEADER_TOOLBAR_HEIGHT = 56;

// react-native-screens' own Screen.tsx picks a different Fabric component for a modally-presented
// screen ('RNSModalScreen' instead of plain 'RNSScreen') because "there is a need for different
// shadow nodes" (its own comment). RNSScreen.mm's updateLayoutMetrics only skips applying Yoga's
// computed frame for `[self isKindOfClass:RNSModalScreen.class]` ("the available space is most
// likely restricted & differs from what Yoga resolves during first layout - we want to rely on
// native layout here"). Emitting plain 'RNSScreen' for a formSheet/modal means that check never
// matches, so Yoga's frame (computed as an ordinary push-stack sibling) applies uncorrected,
// shifting the modal down by one full screen height (see register.ts's incident note). Mirrors
// Screen.tsx's `shouldUseModalScreenComponent` exactly, including the iOS-only scope (Android
// sizes modals natively regardless of Fabric view name).
export function resolveScreenViewName(
  stackPresentation: IStackPresentation | undefined,
  isAndroid: boolean,
): string {
  if (isAndroid) return RNS_SCREEN_VIEW_NAME;
  const isPlainPresentation =
    stackPresentation === undefined ||
    stackPresentation === 'push' ||
    stackPresentation === 'containedModal' ||
    stackPresentation === 'containedTransparentModal';
  return isPlainPresentation ? RNS_SCREEN_VIEW_NAME : RNS_MODAL_SCREEN_VIEW_NAME;
}

export function resolveScreenContentWrapperStyle(
  stackPresentation: IStackPresentation | undefined,
  headerHidden: boolean,
  headerTranslucent: boolean | undefined,
  isAndroid: boolean,
): Record<string, unknown> {
  let baseStyles;

  if (stackPresentation !== 'formSheet') {
    baseStyles = SCREEN_CONTENT_WRAPPER_FLEX_STYLE;
  } else if (isAndroid) {
    baseStyles = {
      ...SHEET_CONTENT_WRAPPER_STYLE,
      bottom: 0,
    };
  } else {
    baseStyles = SHEET_CONTENT_WRAPPER_STYLE;
  }

  // paddingTop compensates the Android-only ScrollingViewBehavior removal above; iOS never needs
  // it, so the `!isAndroid` check must stay.
  if (!isAndroid || headerHidden || !headerTranslucent) return baseStyles;
  return { ...baseStyles, paddingTop: ANDROID_HEADER_TOOLBAR_HEIGHT };
}

// A modally-presented screen (anything but 'push') has no UINavigationController on iOS, so
// RNSScreenStackHeaderConfig has nothing to attach a header bar to. react-native-screens' own
// ScreenStackItem.tsx (isHeaderInModal) works around this by nesting header + content inside a
// second, inner RNSScreenStack/RNSScreen pair purely to host the native nav bar. This is a UIKit
// constraint, not a React-renderer one, so it applies identically here. Android has no such
// requirement (its header draws without a nav-controller host).
export function isHeaderInModal(
  stackPresentation: IStackPresentation | undefined,
  headerHidden: boolean,
  isAndroid: boolean,
): boolean {
  if (isAndroid) return false;
  return (stackPresentation ?? STACK_DEFAULT_PRESENTATION) !== 'push' && !headerHidden;
}

// Inner-modal wrapper styles for isHeaderInModal: the inner RNSScreenStack fills its outer
// RNSScreen, and the inner RNSScreen fills the stack absolutely on all four edges. This mirrors
// react-native-screens' own `styles.container` / `StyleSheet.absoluteFill` for this exact pair.
const HEADER_IN_MODAL_STACK_STYLE = { flex: 1 };
const HEADER_IN_MODAL_SCREEN_STYLE = { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 };

export function resolveHeaderInModalStackStyle(): Record<string, unknown> {
  return HEADER_IN_MODAL_STACK_STYLE;
}

export function resolveHeaderInModalScreenStyle(): Record<string, unknown> {
  return HEADER_IN_MODAL_SCREEN_STYLE;
}

// The RNSScreen leaf's own props; the adapter spreads this record directly onto the element it
// builds and appends the header config child and real screen content itself, not here.
export function resolveScreenProps(view: IScreenViewProps): Record<string, unknown> {
  return {
    ...view.passthrough,
    screenId: view.screenId,
    activityState: view.activityState,
    gestureEnabled: view.gestureEnabled,
    stackAnimation: view.stackAnimation ?? STACK_DEFAULT_ANIMATION,
    stackPresentation: view.stackPresentation ?? STACK_DEFAULT_PRESENTATION,
    // Off by default upstream; a formSheet's updateBounds pushes the sheet's live native size
    // into Fabric's shadow state on every drag frame, and this switches that push from
    // Asynchronous to EventQueue::UpdateMode::unstable_Immediate. The ScrollView-frame correction
    // that fills a taller detent (RNSScreenContentWrapper.mm's
    // coerceChildScrollViewComponentSizeToSize) is driven by that same state, so an async push
    // likely lags one step behind a fast drag. Scoped to formSheet: push/plain-modal screens have
    // no comparable live-resize need.
    synchronousShadowStateUpdatesEnabled: view.stackPresentation === 'formSheet',
    transitionDuration: view.transitionDuration,
    sheetAllowedDetents: view.sheetAllowedDetents,
    // Native RNSScreen's real prop names carry an "Index" suffix (react-native-screens' own
    // types.tsx); without it the value never reaches the native view and silently falls back to
    // RNS's default.
    sheetLargestUndimmedDetentIndex: view.sheetLargestUndimmedDetent,
    sheetInitialDetentIndex: view.sheetInitialDetent,
    sheetGrabberVisible: view.sheetGrabberVisible,
    sheetCornerRadius: view.sheetCornerRadius,
    sheetExpandsWhenScrolledToEdge: view.sheetExpandsWhenScrolledToEdge,
    sheetElevation: view.sheetElevation,
    sheetShouldOverflowTopInset: view.sheetShouldOverflowTopInset,
    sheetDefaultResizeAnimationEnabled: view.sheetDefaultResizeAnimationEnabled,
    statusBarStyle: view.statusBarStyle,
    statusBarHidden: view.statusBarHidden,
    statusBarAnimation: view.statusBarAnimation,
    screenOrientation: view.screenOrientation,
  };
}

// `style: {flex: 1}` is ours, not react-native-screens': RNSScreenStackView sizes its nav
// controller to `self.bounds`, which Yoga would otherwise collapse to zero, and (unlike RN's
// own ScreenStack.tsx) we drive the native view directly (<third_party_rn_packages_are_react_only>).
export function resolveStackProps(view: IStackViewProps): Record<string, unknown> {
  return { style: { flex: 1 }, ...view.passthrough };
}

// The RNSScreenStackHeaderConfig leaf is a full Descriptor since it never hosts framework children,
// so the adapter bridges it verbatim (descriptorToReact/descriptorToVue) as the screen's first
// child, ahead of the real content. `searchBarProps` nests as an RNSSearchBar wrapped in an
// RNSScreenStackHeaderSubview(type: 'searchBar'), matching how react-native-screens' own JS
// component mounts it (see resolveSearchBarView's comment in screen-options.ts); omitted when the
// screen has no search bar.
export function renderHeaderConfig(
  view: IHeaderConfigViewProps,
  searchBarProps?: Record<string, unknown>,
): IDescriptor {
  const props: Record<string, unknown> = {
    ...view.passthrough,
    title: view.title,
    hidden: view.hidden,
    // Android-only (CustomToolbar.kt gates its WindowInsets padding on these; iOS's
    // UINavigationController lays out under the safe area regardless). Upstream's JS
    // ScreenStackHeaderConfig computes these via an EdgeInsetApplicationContext that coordinates a
    // "consume once" top inset across nested headers; we drive RNSScreenStackHeaderConfig directly
    // and skip that layer, so without this the native default (false) leaves the header glued
    // under the status bar/cutout on Android. Every adapter renders one active header at a time,
    // so consuming all four edges matches upstream's default for the common case; a genuine
    // nested-header edge case would need upstream's same coordination.
    consumeTopInset: !view.hidden,
    consumeLeftInset: !view.hidden,
    consumeRightInset: !view.hidden,
    consumeBottomInset: !view.hidden,
    backTitle: view.backTitle,
    backTitleVisible: view.backTitleVisible,
    backButtonDisplayMode: view.backButtonDisplayMode,
    largeTitle: view.largeTitle,
    translucent: view.translucent,
    color: view.color,
    titleColor: view.titleColor,
    backgroundColor: view.backgroundColor,
    largeTitleBackgroundColor: view.largeTitleBackgroundColor,
    userInterfaceStyle: view.userInterfaceStyle,
    headerLeftBarButtonItems: view.headerLeftBarButtonItems,
    headerRightBarButtonItems: view.headerRightBarButtonItems,
    [HEADER_ON_PRESS_BAR_BUTTON_ITEM]: view.onPressHeaderBarButtonItem,
    [HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM]: view.onPressHeaderBarButtonMenuItem,
  };
  const children = searchBarProps
    ? [
        el(RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME, { type: 'searchBar' }, [
          el(RNS_SEARCH_BAR_VIEW_NAME, searchBarProps),
        ]),
      ]
    : [];
  return el(RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME, props, children);
}

// The RNSSearchBar leaf's static config props; event handlers ride in `passthrough`.
// renderHeaderConfig wraps this into the RNSSearchBar Descriptor and nests it as the header
// config's child.
export function resolveSearchBarProps(view: ISearchBarViewProps): Record<string, unknown> {
  return {
    ...view.passthrough,
    placeholder: view.placeholder,
    autoCapitalize: view.autoCapitalize,
    placement: view.placement,
    hideWhenScrolling: view.hideWhenScrolling,
    allowToolbarIntegration: view.allowToolbarIntegration,
    obscureBackground: view.obscureBackground,
    hideNavigationBar: view.hideNavigationBar,
    cancelButtonText: view.cancelButtonText,
    barTintColor: view.barTintColor,
    tintColor: view.tintColor,
    textColor: view.textColor,
    autoFocus: view.autoFocus,
    disableBackButtonOverride: view.disableBackButtonOverride,
    inputType: view.inputType,
    hintTextColor: view.hintTextColor,
    headerIconColor: view.headerIconColor,
    shouldShowHintSearchIcon: view.shouldShowHintSearchIcon,
  };
}

// The 7 search-bar event keys -> option-callback passthrough: zero lifecycle dependency, so every
// adapter built the identical map by hand. `log` is an optional per-event hook so an adapter can
// still attach its own route-scoped dlog line (React/Vue do; Angular doesn't) without forking the
// map itself.
export function buildSearchBarPassthrough(
  options: ISearchBarOptions,
  log?: (message: string) => void,
): Record<string, (event: ISymbioteEvent) => void> {
  return {
    [SEARCH_BAR_ON_FOCUS]: () => {
      log?.('search bar focused');
      options.onFocus?.();
    },
    [SEARCH_BAR_ON_BLUR]: () => {
      log?.('search bar blurred');
      options.onBlur?.();
    },
    [SEARCH_BAR_ON_CHANGE_TEXT]: (event: ISymbioteEvent) => {
      const { text } = event.nativeEvent;
      const changedText = typeof text === 'string' ? text : '';
      log?.(`search text changed: ${changedText}`);
      options.onChangeText?.(changedText);
    },
    [SEARCH_BAR_ON_SEARCH_BUTTON_PRESS]: (event: ISymbioteEvent) => {
      const { text } = event.nativeEvent;
      const pressedText = typeof text === 'string' ? text : '';
      log?.(`search button pressed: ${pressedText}`);
      options.onSearchButtonPress?.(pressedText);
    },
    [SEARCH_BAR_ON_CANCEL_BUTTON_PRESS]: () => {
      log?.('search bar cancel pressed');
      options.onCancelButtonPress?.();
    },
    [SEARCH_BAR_ON_CLOSE]: () => {
      log?.('search bar closed');
      options.onClose?.();
    },
    [SEARCH_BAR_ON_OPEN]: () => {
      log?.('search bar opened');
      options.onOpen?.();
    },
  };
}

// A screen's resolved render plan: the framework-agnostic half of one RNSScreen entry, threading
// a route's merged options through the same ~14-call resolver sequence every adapter's render loop
// used to repeat by hand (see the architecture review this facade answers). Lifecycle-bound event
// wiring (SCREEN_ON_* -> dispatch/emit, the search bar's imperative ref) stays adapter-owned and
// arrives here already built, via `screenPassthrough`/`searchBarPassthrough`; likewise the actual
// element/component creation (createElement/h/the Angular template) stays adapter-owned and reads
// off this plan's fields instead of re-deriving them.
export type IScreenRenderPlanInput = {
  screenId: string;
  index: number;
  routeCount: number;
  options: IScreenOptions | undefined;
  platform: INavigatorPlatform;
  isAndroid: boolean;
  screenPassthrough: Record<string, unknown>;
  // Already includes the imperative ref key where an adapter wires one (React/Vue); Angular wires
  // its ref via a directive instead, so its map never carries one. Omitted entirely when the
  // screen has no search bar.
  searchBarPassthrough?: Record<string, unknown>;
};

export type IScreenRenderPlan = {
  activityState: number;
  // The outer RNSScreen/RNSModalScreen Fabric component name (resolveScreenViewName).
  screenViewName: string;
  screenProps: Record<string, unknown>;
  // Full Descriptor (react-native-screens' own react-native-renderer/src/ReactFiberConfigFabric.js
  // style props + a nested RNSSearchBar child when the screen has one) for the adapters that
  // bridge it verbatim via descriptorToReact/descriptorToVue; Angular reads only `.props` and
  // renders the search bar itself through its own template (see isHeaderInModal's rationale below
  // for why Angular's element assembly differs here).
  headerConfig: IDescriptor;
  // The RNSSearchBar leaf's own props, standalone from `headerConfig` for the adapters (Angular)
  // that mount it as a separate host element rather than through `headerConfig`'s children.
  // undefined when the screen has no search bar.
  searchBarProps: Record<string, unknown> | undefined;
  // Always includes `collapsable: false` (see RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME's rationale in
  // core/constants.ts) - every adapter passed this exact pair together, never the style alone.
  contentWrapperProps: Record<string, unknown>;
  inModal: boolean;
  innerStackStyle: Record<string, unknown>;
  innerScreenStyle: Record<string, unknown>;
};

export function resolveScreenRenderPlan(input: IScreenRenderPlanInput): IScreenRenderPlan {
  const { options, isAndroid } = input;
  const headerHidden = options?.headerShown === false;
  const activityState = computeActivityState(input.index, input.routeCount);

  const screenProps = resolveScreenProps(
    resolveScreenView(input.screenId, activityState, options, input.screenPassthrough),
  );

  const searchBarOptions = options?.headerSearchBarOptions;
  const searchBarProps = searchBarOptions
    ? resolveSearchBarProps(
        resolveSearchBarView(searchBarOptions, input.searchBarPassthrough ?? {}),
      )
    : undefined;

  // See renderHeaderConfig's own header comment for why `props` never reflects `searchBarProps` --
  // only `children` does -- so passing it here unconditionally is safe even for Angular, which
  // never reads `children` off the result.
  const headerConfig = renderHeaderConfig(
    resolveHeaderConfigView(options, input.platform),
    searchBarProps,
  );

  return {
    activityState,
    screenViewName: resolveScreenViewName(options?.stackPresentation, isAndroid),
    screenProps,
    headerConfig,
    searchBarProps,
    contentWrapperProps: {
      style: resolveScreenContentWrapperStyle(
        options?.stackPresentation,
        headerHidden,
        options?.headerTranslucent,
        isAndroid,
      ),
      collapsable: false,
    },
    inModal: isHeaderInModal(options?.stackPresentation, headerHidden, isAndroid),
    innerStackStyle: resolveHeaderInModalStackStyle(),
    innerScreenStyle: resolveHeaderInModalScreenStyle(),
  };
}
