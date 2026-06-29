// @symbiote/react: a react-reconciler host config (mutation mode) over
// @symbiote/engine. React is a known-good driver: it proves the native pipe
// (R1) and shared's clone-on-write engine (R2) before any non-React adapter.

export { View, Text } from './components';
export type { IViewProps, ITextProps } from './components';
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
} from '@symbiote/components';
export type { IResponderProps } from './responder-props';
export { Image, setImageSourceResolver } from './image';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './image';
export { ImageBackground } from './image-background';
export type { IImageBackgroundProps } from './image-background';
export { ScrollView } from './scroll-view';
export type { IScrollViewProps, IScrollViewHandle } from './scroll-view';
export { TextInput } from './text-input';
export type { ITextInputProps, ITextInputHandle } from './text-input';
export { InputAccessoryView } from './input-accessory-view';
export type { IInputAccessoryViewProps } from './input-accessory-view';
export { Keyboard, KEYBOARD_EVENT } from './keyboard';
export type { IKeyboardEventName } from './keyboard';
export { KeyboardAvoidingView } from './keyboard-avoiding-view';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './keyboard-avoiding-view';
export { StatusBar } from './status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './status-bar';

export { Switch } from './switch';
export type { ISwitchProps, ISwitchTrackColor } from './switch';
export { ActivityIndicator } from './activity-indicator';
export type { IActivityIndicatorProps } from './activity-indicator';
export { SafeAreaView } from './safe-area-view';
export type { ISafeAreaViewProps } from './safe-area-view';
export { RefreshControl } from './refresh-control';
export type { IRefreshControlProps } from './refresh-control';
export { Modal } from './modal';
export type {
  IModalProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
} from './modal';

export { Pressable } from './pressable';
export type { IPressableProps, IPressState } from './pressable';
export { TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback } from './touchable';
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
  ITouchableWithoutFeedbackProps,
} from './touchable';
export { Button } from './button';
export type { IButtonProps } from './button';

export { FlatList } from './flat-list';
export type { IFlatListProps, IFlatListHandle } from './flat-list';
export { SectionList } from './section-list';
export type { ISectionListProps, ISectionListHandle, ISection } from './section-list';
export { VirtualizedSectionList } from './virtualized-section-list';
export type {
  IVirtualizedSectionListProps,
  IVirtualizedSectionListHandle,
} from './virtualized-section-list';
export { VirtualizedList } from './virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListHandle,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
} from './virtualized-list';

export type { IViewStyle, ITextStyle, IFlexAlign, IFlexJustify } from './styles';
export { mount, unmount } from './render';
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
// AppRegistry: RN's app entry point over `mount`. setHostRegistrar wires RN's own
// registrar so the native Fabric host finds our runnable by app key.
export { AppRegistry, setHostRegistrar } from './app-registry';
export type {
  IComponentProvider,
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IWrapperComponentProvider,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from './app-registry';

// Animated bridge: createAnimatedComponent + Animated.View/Text/Image, driving the
// shared JS Animated engine (ADR 0016). Imperative timing/spring drivers merge into
// this namespace once they land in shared.
export { Animated, createAnimatedComponent } from './animated';

// Framework-agnostic runtime utilities live in shared; the adapter re-exports them
// so app code names only @symbiote/react (RN's surface, one import root).
export { Platform, StyleSheet } from '@symbiote/engine';
// Color utilities: PlatformColor / DynamicColorIOS build opaque platform colors;
// processColor runs a color through the injected platform processor. All pure /
// seam-backed, so they live in shared and the adapter re-exports them.
export { PlatformColor, DynamicColorIOS, processColor } from '@symbiote/engine';
export type { IColorValue, IOpaqueColorValue, IDynamicColorIOSTuple } from '@symbiote/engine';
// Wired once by the app entry on a real host (like setColorProcessor): hands shared
// RN's ViewConfig registry so third-party Fabric views auto-derive their metadata:
//   setNativeViewConfigSource(name => ReactNativeViewConfigRegistry.get(name))
export { setNativeViewConfigSource } from '@symbiote/engine';
export type { INativeViewConfig, INativeViewConfigSource } from '@symbiote/engine';
export type {
  IPlatformStatic,
  IPlatformOSType,
  IPlatformConstantsIOS,
  IPlatformConstantsAndroid,
  IPlatformSelectSpec,
} from '@symbiote/engine';

// Runtime modules: native-bridge consumers, same shape as Keyboard/StatusBar:
// thin JS over getNativeModule + device events, no Fabric component of their own.
export { Dimensions } from './dimensions';
export type {
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
} from './dimensions';
export { PixelRatio } from '@symbiote/engine';
export type { IPixelRatioStatic } from '@symbiote/engine';
export { useWindowDimensions } from './use-window-dimensions';
export { Appearance } from './appearance';
export type { IColorSchemeName, IColorSchemePreference } from './appearance';
export { useColorScheme } from './use-color-scheme';
export { AppState } from './app-state';
export type { IAppStateStatus, IAppStateEvent } from './app-state';
export { Alert } from './alert';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
} from './alert';
export { ActionSheetIOS } from './action-sheet-ios';
export type {
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
} from './action-sheet-ios';
export { Linking } from './linking';
export type { IUrlEvent } from './linking';
export { Vibration } from './vibration';
export { Share } from './share';
export type { IShareContent, IShareOptions, IShareAction } from './share';
export { AccessibilityInfo } from './accessibility-info';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from './accessibility-info';
export { I18nManager } from './i18n-manager';
export type { II18nManagerConstants } from './i18n-manager';
export { Settings } from './settings';

// Interaction subsystems: gestures, deferred work, and layout transitions.
export { PanResponder } from '@symbiote/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiote/engine';
export { LayoutAnimation } from './layout-animation';
export type {
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
} from './layout-animation';
// InteractionManager is pure JS, so it lives in shared; re-exported here so app code
// names only @symbiote/react (RN's single import root).
export { InteractionManager } from '@symbiote/engine';
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
} from '@symbiote/engine';

// Android-only surface (the second-platform pass). Each is a thin JS shim over an
// Android native module / Fabric view, inert on iOS (no module → graceful no-op,
// no native view → degrade to a plain container). Native module names are
// device-verify-pending; see .docs/native-module-platform-routing.md.
export { BackHandler } from './back-handler';
export type { IBackPressEventName, IBackPressHandler } from './back-handler';
export { ToastAndroid } from './toast-android';
export { PermissionsAndroid, PERMISSIONS, RESULTS } from './permissions-android';
export type { IPermission, IPermissionStatus, IRationale } from './permissions-android';
export { TouchableNativeFeedback } from './touchable-native-feedback';
export type {
  ITouchableNativeFeedbackProps,
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './touchable-native-feedback';
export { DrawerLayoutAndroid } from './drawer-layout-android';
export type {
  IDrawerLayoutAndroidProps,
  IDrawerLayoutAndroidHandle,
  IDrawerPosition,
  IDrawerLockMode,
  IKeyboardDismissMode,
  IDrawerState,
  IDrawerSlideEvent,
} from './drawer-layout-android';

export type { ISymbioteEvent } from '@symbiote/engine';
