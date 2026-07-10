// Navigator: the render half (framework-agnostic). Unlike the slider (one native leaf), a
// screen's content is an arbitrary framework subtree the adapter owns — so, mirroring the
// custom-StepMarker-overlay precedent (assembled per-adapter at the element level), these
// resolvers hand back PLAIN PROPS OBJECTS for the RNSScreen/RNSScreenStack leaves the adapter
// builds itself with real children, and one full Descriptor for the header config. The header
// config Descriptor never takes FRAMEWORK children (headerLeftBarButtonItems/
// headerRightBarButtonItems are native config arrays, already native-shaped by screen-options.ts,
// not elements) — but it does optionally nest one RNSSearchBar leaf, wrapped in an
// RNSScreenStackHeaderSubview(type: 'searchBar'), matching how react-native-screens' own JS
// component (ScreenStackHeaderSearchBarView) mounts it. RNSScreenStackHeaderConfig.mm's
// mountChildComponentView requires EVERY child to be an RNSScreenStackHeaderSubview instance —
// a bare RNSSearchBar child is rejected natively ("ScreenStackHeader only accepts children of
// type ScreenStackHeaderSubview") — and its header-building code then reads the search bar back
// out via `subview.subviews[0]`, i.e. one level inside the subview wrapper, not the subview itself.

import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  HEADER_ON_PRESS_BAR_BUTTON_ITEM,
  HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM,
  RNS_MODAL_SCREEN_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME,
  RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME,
  RNS_SCREEN_VIEW_NAME,
  RNS_SEARCH_BAR_VIEW_NAME,
  STACK_DEFAULT_ANIMATION,
  STACK_DEFAULT_PRESENTATION,
} from './constants';
import type {
  IHeaderConfigViewProps,
  IScreenViewProps,
  ISearchBarViewProps,
  IStackPresentation,
  IStackViewProps,
} from './navigator-props';

// Mirrors react-native-screens' own ScreenStackItem.tsx (getPositioningStyle): a formSheet's
// content wrapper does NOT get `flex: 1` — RNSScreen.mm's updateBounds pushes the sheet's live
// native size into Fabric's shadow STATE on every frame of a detent drag, and a `bottom: 0`-pinned
// (i.e. `flex: 1`) wrapper forces React to set a strict frame on every one of those updates,
// which is exactly the visible flicker PR #1870 fixed by switching to `absoluteWithNoBottom`
// instead (RNSScreen.mm's own comment: "to mitigate view flickering... we do not set `bottom: 0`
// in JS for wrapper of the screen content, causing React to not set strict frame every time the
// sheet size is updated"). The tradeoff this accepts: content shorter than the sheet's current
// detent leaves a plain-background gap below it — react-native-screens' own native fix for THAT
// (RNSScreenContentWrapper.mm's coerceChildScrollViewComponentSizeToSize) only kicks in for a
// screen whose content is a ScrollView, which it resizes directly to the sheet's real frame,
// bypassing Yoga/flex entirely — not a style choice available from here.
const SCREEN_CONTENT_WRAPPER_FLEX_STYLE = { flex: 1 };
const SHEET_CONTENT_WRAPPER_STYLE = {
  position: 'absolute',
  top: 0,
  start: 0,
  end: 0,
  bottom: undefined,
};

// Android's native header (react-native-screens' CustomToolbar, hosted in a CoordinatorLayout
// alongside an AppBarLayout) auto-offsets the screen content BELOW the header via a standard
// Material `AppBarLayout.ScrollingViewBehavior` attached to the screen's own CoordinatorLayout
// params — see ScreenStackFragment.kt's setToolbarTranslucent: `behavior = if (translucent) null
// else ScrollingViewBehavior()`. So a PLAIN (non-translucent) header gets this offset for free,
// natively, and needs no JS compensation. Setting `headerTranslucent: true` explicitly REMOVES
// that behavior (`behavior = null`) — react-native-screens' own contract for translucent is
// "the toolbar's opaque background goes away AND content is no longer auto-pushed below it",
// e.g. for a screen that wants to paint under a see-through header. But an app that sets
// headerTranslucent purely for a custom (still effectively opaque, just app-styled) header look
// while still relying on its own SafeAreaView for safe-area content — the common case here —
// loses the free offset and gets clipped: SafeAreaView's Android inset is WindowInsetsCompat's
// systemBars() only (status-bar/cutout), which has no idea a sibling Toolbar exists, so content
// starts right at the status-bar inset and paints its first 56dp UNDER the header, invisibly
// clipped. Verified empirically (2026-07-10) via `adb shell uiautomator dump` bounds on a real
// translucent-header screen: content (e.g. a drawer panel) measured starting at y=0, not below
// the header's real bottom edge (see the navigation-header-content-offset skill for the full
// incident, including the earlier inverted-condition bug this replaced). iOS's
// UINavigationController already lays out content below its real nav bar natively regardless of
// translucency, so this compensation is Android-only, and only when THIS package's ScrollingView-
// Behavior replacement (the translucent-only removal) is actually in play — i.e. only when
// translucent. Skipped when the header is hidden (nothing to clear) or NOT translucent (the
// native behavior already handles it — adding padding there would double-offset).
const ANDROID_HEADER_TOOLBAR_HEIGHT = 56;

// react-native-screens' own Screen.tsx picks a DIFFERENT Fabric component for a modally-presented
// screen — 'RNSModalScreen' instead of plain 'RNSScreen' — because "there is a need for different
// shadow nodes" (its own comment). RNSScreen.mm's updateLayoutMetrics: checks
// `[self isKindOfClass:RNSModalScreen.class]` and, only for that class, skips applying Yoga's
// computed frame entirely ("the available space is most likely restricted & differs from what
// Yoga resolves during first layout — we want to rely on native layout here"). Emitting plain
// 'RNSScreen' for a formSheet/modal screen means that check never matches: Yoga's frame — computed
// as if the screen were still an ordinary flexed sibling in its outer RNSScreenStack's push-
// oriented layout — gets applied verbatim and is never corrected, visually shifting the whole
// modal down by one full screen height (see register.ts's incident note). Mirrors Screen.tsx's own
// `shouldUseModalScreenComponent` condition exactly, including the iOS-only scope (Android's
// RNSScreenStackFragment sizes modals natively regardless of Fabric view name).
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

  // paddingTop compensates react-native-screens' Android-only ScrollingViewBehavior removal
  // (see the comment above ANDROID_HEADER_TOOLBAR_HEIGHT). iOS doesn't need it, so keep the
  // `!isAndroid` check.
  if (!isAndroid || headerHidden || !headerTranslucent) return baseStyles;
  return { ...baseStyles, paddingTop: ANDROID_HEADER_TOOLBAR_HEIGHT };
}

// A modally-presented screen (anything but 'push') has no UINavigationController of its own on
// iOS, so RNSScreenStackHeaderConfig's native side has nothing to attach a header bar to —
// react-native-screens' own ScreenStackItem.tsx (isHeaderInModal) works around this by nesting the
// header + content inside a SECOND, inner RNSScreenStack/RNSScreen pair purely to host the native
// nav bar. This is a UIKit constraint, not a React-renderer one, so it applies identically here.
// Android's header has no such requirement (native header is drawn without a nav-controller host).
export function isHeaderInModal(
  stackPresentation: IStackPresentation | undefined,
  headerHidden: boolean,
  isAndroid: boolean,
): boolean {
  if (isAndroid) return false;
  return (stackPresentation ?? STACK_DEFAULT_PRESENTATION) !== 'push' && !headerHidden;
}

// Inner-modal wrapper styles for isHeaderInModal: the inner RNSScreenStack fills its outer
// RNSScreen, and the inner RNSScreen fills the stack absolutely on all four edges — mirrors
// react-native-screens' own `styles.container` / `StyleSheet.absoluteFill` for this exact pair.
const HEADER_IN_MODAL_STACK_STYLE = { flex: 1 };
const HEADER_IN_MODAL_SCREEN_STYLE = { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 };

export function resolveHeaderInModalStackStyle(): Record<string, unknown> {
  return HEADER_IN_MODAL_STACK_STYLE;
}

export function resolveHeaderInModalScreenStyle(): Record<string, unknown> {
  return HEADER_IN_MODAL_SCREEN_STYLE;
}

// The RNSScreen leaf's own props (screenId/activityState/animation/presentation + whatever
// lifecycle event handlers the adapter wired into `passthrough`). The adapter spreads this
// directly onto the element it builds — the header config child and the real screen content
// are appended by the adapter, not here.
export function resolveScreenProps(view: IScreenViewProps): Record<string, unknown> {
  return {
    ...view.passthrough,
    screenId: view.screenId,
    activityState: view.activityState,
    gestureEnabled: view.gestureEnabled,
    stackAnimation: view.stackAnimation ?? STACK_DEFAULT_ANIMATION,
    stackPresentation: view.stackPresentation ?? STACK_DEFAULT_PRESENTATION,
    // Off by default in react-native-screens; a formSheet's own updateBounds pushes the sheet's
    // live native size into Fabric's shadow state on every frame of a detent drag, and this
    // switches that push from Asynchronous to EventQueue::UpdateMode::unstable_Immediate — the
    // ScrollView-frame correction that fills a taller detent (RNSScreenContentWrapper.mm's
    // coerceChildScrollViewComponentSizeToSize) is driven by that same state, so an async push
    // is the likely source of it visibly lagging one step behind a fast drag. Scoped to formSheet
    // only: push/plain-modal screens have no comparable live-resize need for it.
    synchronousShadowStateUpdatesEnabled: view.stackPresentation === 'formSheet',
    transitionDuration: view.transitionDuration,
    sheetAllowedDetents: view.sheetAllowedDetents,
    // Native RNSScreen's real prop names both carry an "Index" suffix (confirmed against
    // react-native-screens' own types.tsx) — these two keys were missing it, so neither value
    // ever reached the native view; it silently fell back to RNS's own default instead.
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

// The RNSScreenStack container's own props (the transition-finished passthrough handler plus
// whatever else rides through). Children (the RNSScreen route list) are appended by the adapter.
// `style: {flex: 1}` is a default, not react-native-screens' own behavior: RNSScreenStackView
// sizes its internal navigation controller to `self.bounds`, which Yoga otherwise collapses to
// zero (react-native-screens' JS ScreenStack.tsx normally supplies this size; we drive the
// native view directly, per <third_party_rn_packages_are_react_only>, so nothing else would).
export function resolveStackProps(view: IStackViewProps): Record<string, unknown> {
  return { style: { flex: 1 }, ...view.passthrough };
}

// The RNSScreenStackHeaderConfig leaf is a full Descriptor: it never hosts FRAMEWORK children in
// the v1 scope, so the adapter can bridge it verbatim (descriptorToReact/descriptorToVue) as the
// screen's first child, ahead of the real screen content. `searchBarProps` — resolveSearchBarProps'
// resolved native-props record — nests as an RNSSearchBar wrapped in an
// RNSScreenStackHeaderSubview(type: 'searchBar'), exactly how react-native-screens' own JS
// component mounts it (see resolveSearchBarView's comment in screen-options.ts); omitted entirely
// when the screen has no search bar, so the Descriptor keeps zero children as today.
export function renderHeaderConfig(
  view: IHeaderConfigViewProps,
  searchBarProps?: Record<string, unknown>,
): IDescriptor {
  const props: Record<string, unknown> = {
    ...view.passthrough,
    title: view.title,
    hidden: view.hidden,
    // Android-only (react-native-screens' CustomToolbar.kt gates its WindowInsets padding on
    // these; iOS's UINavigationController lays out under the safe area regardless). Upstream's
    // own JS ScreenStackHeaderConfig computes these from an EdgeInsetApplicationContext that
    // coordinates a "consume once" top inset across NESTED headers in the same tree — we drive
    // RNSScreenStackHeaderConfig directly and skip that JS layer (constants.ts), so without this
    // the native default (false) leaves a visible header glued under the status bar/cutout on
    // Android. Every adapter renders one active header at a time, so consuming all four edges
    // whenever the header is visible matches upstream's default for the common case; a genuine
    // nested-header double-consumption edge case would need the same coordination upstream has.
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

// The RNSSearchBar leaf's own static config props; event handlers (onSearchFocus, onChangeText,
// …) ride in `passthrough`. Mirrors resolveScreenProps: a plain props record — renderHeaderConfig
// is what wraps it into the RNSSearchBar Descriptor and nests it as the header config's child.
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
