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
export type { IResponderProps } from './utils/responder-props';
export { Image, setImageSourceResolver } from './components/image';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './components/image';
export { ImageBackground } from './components/image-background';
export type { IImageBackgroundProps } from './components/image-background';
export { ScrollView } from './components/scroll-view';
export type { IScrollViewProps, IScrollViewHandle } from './components/scroll-view';
export { TextInput } from './components/text-input';
export type { ITextInputProps, ITextInputHandle } from './components/text-input';
export { InputAccessoryView } from './components/input-accessory-view';
export type { IInputAccessoryViewProps } from './components/input-accessory-view';
export { Keyboard, KEYBOARD_EVENT } from './modules/keyboard';
export type { IKeyboardEventName } from './modules/keyboard';
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './components/keyboard-avoiding-view';
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';

export { Switch } from './components/switch';
export type { ISwitchProps, ISwitchTrackColor } from './components/switch';
export { ActivityIndicator } from './components/activity-indicator';
export type { IActivityIndicatorProps } from './components/activity-indicator';
export { SafeAreaView } from './components/safe-area-view';
export type { ISafeAreaViewProps } from './components/safe-area-view';
export { RefreshControl } from './components/refresh-control';
export type { IRefreshControlProps } from './components/refresh-control';
export { Modal } from './components/modal';
export type {
  IModalProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
} from './components/modal';

export { Pressable } from './components/pressable';
export type { IPressableProps, IPressState } from './components/pressable';
export {
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from './components/touchable';
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
  ITouchableWithoutFeedbackProps,
} from './components/touchable';
export { Button } from './components/button';
export type { IButtonProps } from './components/button';

export { FlatList } from './components/flat-list';
export type { IFlatListProps, IFlatListHandle } from './components/flat-list';
export { SectionList } from './components/section-list';
export type { ISectionListProps, ISectionListHandle, ISection } from './components/section-list';
export { VirtualizedSectionList } from './components/virtualized-section-list';
export type {
  IVirtualizedSectionListProps,
  IVirtualizedSectionListHandle,
} from './components/virtualized-section-list';
export { VirtualizedList } from './components/virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListHandle,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
} from './components/virtualized-list';

export type { IViewStyle, ITextStyle, IFlexAlign, IFlexJustify } from './utils/styles';
export { mount, unmount } from './render';
// createPortal: react-reconciler's Fiber-level portal, working here because @symbiote/react is
// mutation-mode (unlike stock RN's persistent-mode Fabric renderer, which doesn't support it —
// see create-portal.ts). v1 scope: target must be an already-mounted node in the SAME surface.
export { createPortal, type IPortalContainer } from './create-portal';
// createTunnel: cross-surface content sharing (createPortal/Teleport stay same-surface-only
// by design — see create-tunnel.tsx and the react-adapter-portal skill for why).
export { createTunnel, type ITunnel } from './create-tunnel';
// descriptorToReact: the @symbiote/components Descriptor → React.createElement bridge. Exported so
// an external wrapper package (e.g. @symbiote/slider/react over a third-party native view) can map
// a shared render fn's Descriptor onto React elements through the SAME bridge the adapter uses.
export { descriptorToReact } from './descriptor-to-react';
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
// AppRegistry: RN's app entry point over `mount`. setHostRegistrar wires RN's own
// registrar so the native Fabric host finds our runnable by app key.
export { AppRegistry, setHostRegistrar } from './modules/app-registry';
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
} from './modules/app-registry';

// Animated bridge: createAnimatedComponent + Animated.View/Text/Image, driving the
// shared JS Animated engine (ADR 0016). Imperative timing/spring drivers merge into
// this namespace once they land in shared.
export { Animated, createAnimatedComponent } from './modules/animated';

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
export { Dimensions } from './modules/dimensions';
export type {
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
} from './modules/dimensions';
export { PixelRatio } from '@symbiote/engine';
export type { IPixelRatioStatic } from '@symbiote/engine';
export { useWindowDimensions } from './hooks/use-window-dimensions';
export { Appearance } from './modules/appearance';
export type { IColorSchemeName, IColorSchemePreference } from './modules/appearance';
export { useColorScheme } from './hooks/use-color-scheme';
export { AppState } from './modules/app-state';
export type { IAppStateStatus, IAppStateEvent } from './modules/app-state';
export { Alert } from './modules/alert';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
} from './modules/alert';
export { ActionSheetIOS } from './modules/action-sheet-ios';
export type {
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
} from './modules/action-sheet-ios';
export { Linking } from './modules/linking';
export type { IUrlEvent } from './modules/linking';
export { Vibration } from './modules/vibration';
export { Share } from './modules/share';
export type { IShareContent, IShareOptions, IShareAction } from './modules/share';
export { AccessibilityInfo } from './modules/accessibility-info';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from './modules/accessibility-info';
export { I18nManager } from './modules/i18n-manager';
export type { II18nManagerConstants } from './modules/i18n-manager';
export { Settings } from './modules/settings';

// Interaction subsystems: gestures, deferred work, and layout transitions.
export { PanResponder } from '@symbiote/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiote/engine';
export { LayoutAnimation } from './modules/layout-animation';
export type {
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
} from './modules/layout-animation';
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
export { BackHandler } from './modules/back-handler';
export type { IBackPressEventName, IBackPressHandler } from './modules/back-handler';
export { ToastAndroid } from './modules/toast-android';
export { PermissionsAndroid, PERMISSIONS, RESULTS } from './modules/permissions-android';
export type { IPermission, IPermissionStatus, IRationale } from './modules/permissions-android';
export { TouchableNativeFeedback } from './components/touchable-native-feedback';
export type {
  ITouchableNativeFeedbackProps,
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './components/touchable-native-feedback';
export type { ISymbioteEvent } from '@symbiote/engine';
