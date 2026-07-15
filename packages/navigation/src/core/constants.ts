// Framework-agnostic constants for the react-native-screens native stack primitives. symbiote
// ships zero ViewConfig metadata for these views at runtime - the engine derives events and
// color processors from react-native-screens' own codegen ViewConfig - this file only names the
// Fabric view names and event prop keys every adapter binds against, plus the RNS activityState
// convention (mirrors @react-navigation/native-stack's internal screen focus signaling).

// The Fabric view names react-native-screens' codegen components register. descriptorFor passes
// any non-`symbiote-` string through as a raw Fabric name, so the render fns emit these directly.
export const RNS_SCREEN_VIEW_NAME = 'RNSScreen';
// The modal-presentation twin of RNSScreen - see resolveScreenViewName's comment in
// render-stack.ts for why a formSheet/modal screen MUST use this different Fabric name.
export const RNS_MODAL_SCREEN_VIEW_NAME = 'RNSModalScreen';
export const RNS_SCREEN_STACK_VIEW_NAME = 'RNSScreenStack';
export const RNS_SCREEN_STACK_HEADER_CONFIG_VIEW_NAME = 'RNSScreenStackHeaderConfig';
// The header-subview leaf react-native-screens itself uses to host arbitrary framework children
// (left/right/back/title/center/searchBar) inside the header. Registered here for ground-truth
// parity, but unconsumed by any fold in v1 scope: renderHeaderConfig's Descriptor never takes
// framework children (see render-stack.ts), so mounting a subview child is left to the adapter.
export const RNS_SCREEN_STACK_HEADER_SUBVIEW_VIEW_NAME = 'RNSScreenStackHeaderSubview';
export const RNS_SEARCH_BAR_VIEW_NAME = 'RNSSearchBar';
// react-native-screens' own JS layer (ScreenStackItem -> DebugContainer -> ScreenContentWrapper)
// ALWAYS wraps a screen's content in this native view, `collapsable: false` so Fabric can never
// flatten it away. RNSScreen.mm's `registerContentWrapper:contentHeightErrata:` is a no-op for
// `push` (early-returns NO), but for `formSheet` it's how the native side ever learns the
// content's real size - RNSScreenContentWrapper's `willMoveToWindow` walks up to the ancestor
// RNSScreen and registers itself, and its `receivedReactFrame:` delegate callback is what feeds
// the sheet's own height/detent machinery. Skipping this wrapper is harmless for `push` (why it
// went unnoticed) but leaves a formSheet screen's native side with nothing to attach to at all.
export const RNS_SCREEN_CONTENT_WRAPPER_VIEW_NAME = 'RNSScreenContentWrapper';

// RNSScreen event prop keys (all DirectEventHandler in the codegen spec).
export const SCREEN_ON_APPEAR = 'onAppear';
export const SCREEN_ON_DISAPPEAR = 'onDisappear';
export const SCREEN_ON_WILL_APPEAR = 'onWillAppear';
export const SCREEN_ON_WILL_DISAPPEAR = 'onWillDisappear';
export const SCREEN_ON_DISMISSED = 'onDismissed';
export const SCREEN_ON_HEADER_BACK_BUTTON_CLICKED = 'onHeaderBackButtonClicked';

// RNSScreenStack event prop key.
export const STACK_ON_FINISH_TRANSITIONING = 'onFinishTransitioning';

// RNSScreenStackHeaderConfig event prop keys (both DirectEventHandler in the codegen spec): a
// plain bar-button-item press, and a press on a (possibly nested) menu action of a 'menu'-type
// bar-button item.
export const HEADER_ON_PRESS_BAR_BUTTON_ITEM = 'onPressHeaderBarButtonItem';
export const HEADER_ON_PRESS_BAR_BUTTON_MENU_ITEM = 'onPressHeaderBarButtonMenuItem';

// RNSSearchBar event prop keys (all DirectEventHandler in the codegen spec). onClose/onOpen are
// Android-only per the codegen spec's own comment.
export const SEARCH_BAR_ON_FOCUS = 'onSearchFocus';
export const SEARCH_BAR_ON_BLUR = 'onSearchBlur';
export const SEARCH_BAR_ON_SEARCH_BUTTON_PRESS = 'onSearchButtonPress';
export const SEARCH_BAR_ON_CANCEL_BUTTON_PRESS = 'onCancelButtonPress';
export const SEARCH_BAR_ON_CHANGE_TEXT = 'onChangeText';
export const SEARCH_BAR_ON_CLOSE = 'onClose';
export const SEARCH_BAR_ON_OPEN = 'onOpen';

// activityState RNS reads to decide which screen is attached to the native hierarchy. Per
// react-native-screens' native RNSScreen.mm (maybeAssertActivityStateProgressionOldValue), an
// already-mounted NativeStack screen's activityState can never DECREASE via a plain prop update -
// only 0 (detached) and 2 (attached + focused) are used; there is no "1 = transitioning" value in
// @react-navigation/native-stack's actual algorithm (NativeStackView.native.tsx computes
// `activityState={isInactive ? 0 : 2}`, never 1). See computeActivityState for the full rationale.
export const SCREEN_ACTIVITY_STATE_FOCUSED = 2;
export const SCREEN_ACTIVITY_STATE_INACTIVE = 0;

export const STACK_DEFAULT_ANIMATION = 'default';
export const STACK_DEFAULT_PRESENTATION = 'push';
