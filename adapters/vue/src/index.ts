// @symbiote/vue: a thin Vue 3 reconciler over @symbiote/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote/vue.

export { mount, unmount } from './render';
export { View, Text } from './components';
// Image. Full parity with React: source/src/srcSet resolution, the width/height → style fold,
// alt → accessibility, and the Image statics (getSize / prefetch / queryCache / …) are shared
// verbatim from @symbiote/components via renderImage; Vue supplies only the functional bridge.
export { Image, setImageSourceResolver } from './image';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './image';
// First component off the shared @symbiote/components layer: render-only, drives the
// agnostic renderActivityIndicator through descriptorToVue. Proof the layer is reusable:
// the render fn is shared verbatim with React; Vue supplies only the bridge.
export { ActivityIndicator } from './activity-indicator';
// First component to bring the state half into Vue (the lastNativeReport reducer + the
// snap-back watch); render shared verbatim with React, Vue supplies the reactive lifecycle.
export { Switch } from './switch';
// ScrollView. Full parity (ADR 0024): vertical + horizontal, every pass-through prop, the
// synthesized onContentSizeChange, the imperative handle via expose() + shallowRef, RefreshControl
// (iOS sibling / Android wrap, Phase 2), and sticky headers (Phase 3: the scroll AnimatedValue,
// the headerLayoutYs cross-talk, and the per-header Animated.View wrap). The pure math (intrinsics,
// decelerationRate, content-size dedupe, the handle, the sticky interpolation) is shared verbatim
// with React from @symbiote/components.
export { ScrollView } from './scroll-view';
export type { IScrollViewProps, IScrollViewHandle } from './scroll-view';
// Pressable family. Full parity with React (the 3-layer split): the press state machine + render
// decisions are shared in @symbiote/components; Vue supplies the reactivity + descriptor bridge.
export { Pressable } from './pressable';
export type { IPressableProps, IPressState, IPressableAndroidRippleConfig } from './pressable';
export { TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback } from './touchable';
export { TouchableNativeFeedback } from './touchable-native-feedback';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './touchable-native-feedback';
export { Button } from './button';
// Phase 2 (ADR 0024): SafeAreaView + RefreshControl, wired into ScrollView with the iOS-sibling /
// Android-wrap platform split. RefreshControl hosts the wrapped scroll view via its default slot.
export { SafeAreaView } from './safe-area-view';
export type { ISafeAreaViewProps } from './safe-area-view';
export { RefreshControl } from './refresh-control';
export type { IRefreshControlProps } from './refresh-control';
export { descriptorToVue } from './descriptor-to-vue';
export { createSymbioteRenderer } from './renderer';
// Animated (ADR 0024 Phase 3a): Animated.View/Text/Image + the lazy Animated.ScrollView over the
// Vue primitives, with the value graph / easing / drivers spread from @symbiote/engine. The wrap
// mechanism (createAnimatedComponent) is the Vue twin of React's; the pure leaves live in the
// engine. FlatList/SectionList are omitted until those base components exist.
export { Animated, createAnimatedComponent } from './animated';

// Visual components off the shared @symbiote/components layer (wave: simple-visual).
export { ImageBackground } from './image-background';
export type { IImageBackgroundProps } from './image-background';
export { InputAccessoryView } from './input-accessory-view';
export type { IInputAccessoryViewProps } from './input-accessory-view';
export { Modal } from './modal';
export type {
  IModalProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from './modal';
// KeyboardAvoidingView: full parity via the shared inset math; Vue owns the Keyboard subscription.
export { KeyboardAvoidingView } from './keyboard-avoiding-view';
export type { IKeyboardAvoidingBehavior } from './keyboard-avoiding-view';
// StatusBar: declarative component + the shared imperative API.
export { StatusBar } from './status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './status-bar';
// Vue composables over the core device-state modules.
export { useColorScheme } from './use-color-scheme';
export { useWindowDimensions } from './use-window-dimensions';

// Imperative runtime modules: the SAME module both adapters share, re-exported from @symbiote/engine.
export {
  Alert,
  Share,
  ActionSheetIOS,
  Linking,
  Vibration,
  ToastAndroid,
  Settings,
  I18nManager,
  Dimensions,
  Appearance,
  AppState,
  Keyboard,
  KEYBOARD_EVENT,
  BackHandler,
  PermissionsAndroid,
  PERMISSIONS,
  RESULTS,
  AccessibilityInfo,
  LayoutAnimation,
} from '@symbiote/engine';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
  IShareContent,
  IShareOptions,
  IShareAction,
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
  IUrlEvent,
  II18nManagerConstants,
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
  IColorSchemeName,
  IColorSchemePreference,
  IAppStateStatus,
  IAppStateEvent,
  IKeyboardEventName,
  IKeyboardEvent,
  IKeyboardMetrics,
  IBackPressEventName,
  IBackPressHandler,
  IPermission,
  IPermissionStatus,
  IRationale,
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
} from '@symbiote/engine';

// Re-export the framework-agnostic engine surface (pure utilities + diagnostics).
export {
  Platform,
  StyleSheet,
  processColor,
  setColorProcessor,
  dlog,
  isDebug,
} from '@symbiote/engine';
export type { ISymbioteEvent, ISymbioteNode, IRootTag } from '@symbiote/engine';
