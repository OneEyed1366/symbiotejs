// @symbiote/react — a react-reconciler host config (mutation mode) over
// @symbiote/shared. React is a known-good driver: it proves the native pipe
// (R1) and shared's clone-on-write engine (R2) before any non-React adapter.

export { View, Text } from './components'
export type { ViewProps, TextProps } from './components'
export { Image, setImageSourceResolver } from './image'
export type {
  ImageProps,
  ImageSource,
  ImageSourceProp,
  ResizeMode,
  ImageSize,
  ImageCacheStatus,
} from './image'
export { ImageBackground } from './image-background'
export type { ImageBackgroundProps } from './image-background'
export { ScrollView } from './scroll-view'
export type { ScrollViewProps } from './scroll-view'
export { TextInput } from './text-input'
export type { TextInputProps } from './text-input'
export { InputAccessoryView } from './input-accessory-view'
export type { InputAccessoryViewProps } from './input-accessory-view'
export { Keyboard, KEYBOARD_EVENT } from './keyboard'
export type { KeyboardEventName } from './keyboard'
export { KeyboardAvoidingView } from './keyboard-avoiding-view'
export type { KeyboardAvoidingViewProps, KeyboardAvoidingBehavior } from './keyboard-avoiding-view'
export { StatusBar } from './status-bar'
export type { StatusBarProps, StatusBarStyle } from './status-bar'

export { Switch } from './switch'
export type { SwitchProps, SwitchTrackColor } from './switch'
export { ActivityIndicator } from './activity-indicator'
export type { ActivityIndicatorProps } from './activity-indicator'
export { SafeAreaView } from './safe-area-view'
export type { SafeAreaViewProps } from './safe-area-view'
export { RefreshControl } from './refresh-control'
export type { RefreshControlProps } from './refresh-control'
export { Modal } from './modal'
export type {
  ModalProps,
  ModalAnimationType,
  ModalPresentationStyle,
  ModalOrientation,
} from './modal'

export { Pressable } from './pressable'
export type { PressableProps, PressState } from './pressable'
export { TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback } from './touchable'
export type {
  TouchableOpacityProps,
  TouchableHighlightProps,
  TouchableWithoutFeedbackProps,
} from './touchable'
export { Button } from './button'
export type { ButtonProps } from './button'

export { FlatList } from './flat-list'
export type { FlatListProps } from './flat-list'
export { SectionList } from './section-list'
export type { SectionListProps, Section } from './section-list'
export { VirtualizedSectionList } from './virtualized-section-list'
export type { VirtualizedSectionListProps } from './virtualized-section-list'
export { VirtualizedList } from './virtualized-list'
export type { VirtualizedListProps } from './virtualized-list'

export type { ViewStyle, TextStyle, FlexAlign, FlexJustify } from './styles'
export { mount } from './render'
export { findNodeHandle } from './host-instance'
export type { HostInstance } from './host-instance'
// AppRegistry — RN's app entry point over `mount`. setHostRegistrar wires RN's own
// registrar so the native Fabric host finds our runnable by app key.
export { AppRegistry, setHostRegistrar } from './app-registry'
export type { ComponentProvider, AppParameters, Runnable, HostRegistrar } from './app-registry'

// Animated bridge: createAnimatedComponent + Animated.View/Text/Image, driving the
// shared JS Animated engine (ADR 0016). Imperative timing/spring drivers merge into
// this namespace once they land in shared.
export { Animated, createAnimatedComponent } from './animated'

// Framework-agnostic runtime utilities live in shared; the adapter re-exports them
// so app code names only @symbiote/react (RN's surface, one import root).
export { Platform, StyleSheet } from '@symbiote/shared'
// Color utilities: PlatformColor / DynamicColorIOS build opaque platform colors;
// processColor runs a color through the injected platform processor. All pure /
// seam-backed, so they live in shared and the adapter re-exports them.
export { PlatformColor, DynamicColorIOS, processColor } from '@symbiote/shared'
export type { ColorValue, OpaqueColorValue, DynamicColorIOSTuple } from '@symbiote/shared'
// Wired once by the app entry on a real host (like setColorProcessor): hands shared
// RN's ViewConfig registry so third-party Fabric views auto-derive their metadata —
//   setNativeViewConfigSource(name => ReactNativeViewConfigRegistry.get(name))
export { setNativeViewConfigSource } from '@symbiote/shared'
export type { NativeViewConfig, NativeViewConfigSource } from '@symbiote/shared'
export type {
  PlatformStatic,
  PlatformOSType,
  PlatformConstantsIOS,
  PlatformConstantsAndroid,
  PlatformSelectSpec,
} from '@symbiote/shared'

// Runtime modules — native-bridge consumers, same shape as Keyboard/StatusBar:
// thin JS over getNativeModule + device events, no Fabric component of their own.
export { Dimensions } from './dimensions'
export type {
  DisplayMetrics,
  DisplayMetricsAndroid,
  DimensionsPayload,
  DimensionsSet,
  DimensionsKey,
  DimensionsChangeListener,
  DimensionsStatic,
} from './dimensions'
export { PixelRatio } from './pixel-ratio'
export type { PixelRatioStatic } from './pixel-ratio'
export { useWindowDimensions } from './use-window-dimensions'
export { Appearance } from './appearance'
export type { ColorSchemeName, ColorSchemePreference } from './appearance'
export { useColorScheme } from './use-color-scheme'
export { AppState } from './app-state'
export type { AppStateStatus, AppStateEvent } from './app-state'
export { Alert } from './alert'
export type { AlertType, AlertButtonStyle, AlertButton, AlertButtons, AlertOptions } from './alert'
export { ActionSheetIOS } from './action-sheet-ios'
export type {
  ActionSheetIOSOptions,
  ShareActionSheetIOSOptions,
  ShareActionSheetError,
} from './action-sheet-ios'
export { Linking } from './linking'
export type { UrlEvent } from './linking'
export { Vibration } from './vibration'
export { Share } from './share'
export type { ShareContent, ShareOptions, ShareAction } from './share'
export { AccessibilityInfo } from './accessibility-info'
export type { AccessibilityChangeEvent } from './accessibility-info'
export { I18nManager } from './i18n-manager'
export type { I18nManagerConstants } from './i18n-manager'
export { Settings } from './settings'

// Interaction subsystems — gestures, deferred work, and layout transitions.
export { default as PanResponder } from './pan-responder'
export type {
  PanResponderGestureState,
  PanResponderCallbacks,
  GestureResponderHandlers,
  PanResponderInstance,
} from './pan-responder'
export { LayoutAnimation } from './layout-animation'
export type {
  LayoutAnimationType,
  LayoutAnimationProperty,
  LayoutAnimationConfig,
  LayoutAnimationAnim,
} from './layout-animation'
// InteractionManager is pure JS, so it lives in shared; re-exported here so app code
// names only @symbiote/react (RN's single import root).
export { InteractionManager } from '@symbiote/shared'
export type { InteractionEvent, SimpleTask, PromiseTask, Task, Handle } from '@symbiote/shared'

// Android-only surface (the second-platform pass). Each is a thin JS shim over an
// Android native module / Fabric view, inert on iOS (no module → graceful no-op,
// no native view → degrade to a plain container). Native module names are
// device-verify-pending — see .docs/native-module-platform-routing.md.
export { BackHandler } from './back-handler'
export type { BackPressEventName, BackPressHandler } from './back-handler'
export { ToastAndroid } from './toast-android'
export { PermissionsAndroid, PERMISSIONS, RESULTS } from './permissions-android'
export type { Permission, PermissionStatus, Rationale } from './permissions-android'
export { TouchableNativeFeedback } from './touchable-native-feedback'
export type {
  TouchableNativeFeedbackProps,
  NativeFeedbackBackground,
  ThemeAttrBackground,
  RippleBackground,
} from './touchable-native-feedback'
export { DrawerLayoutAndroid } from './drawer-layout-android'
export type {
  DrawerLayoutAndroidProps,
  DrawerLayoutAndroidHandle,
  DrawerPosition,
  DrawerLockMode,
  KeyboardDismissMode,
  DrawerState,
  DrawerSlideEvent,
} from './drawer-layout-android'

export type { SymbioteEvent } from '@symbiote/shared'
