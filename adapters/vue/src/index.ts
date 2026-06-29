// @symbiote/vue: a thin Vue 3 reconciler over @symbiote/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote/vue.

export { mount, unmount } from './render';
export { View, Text } from './components';
// Accessibility / ARIA prop types: framework-agnostic, shared verbatim from
// @symbiote/components (the same source the React adapter re-exports).
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
  // Gesture-responder props: framework-agnostic, the shared base of View props.
  IResponderProps,
} from '@symbiote/components';
// findNodeHandle: RN's ref -> native reactTag lookup, the Vue twin of the React adapter's
// host-instance resolution. IHostInstance is the raw engine node (Vue host refs fall
// through to it; imperative methods live on each component's expose() handle).
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
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
export type { IActivityIndicatorProps } from '@symbiote/components';
// First component to bring the state half into Vue (the lastNativeReport reducer + the
// snap-back watch); render shared verbatim with React, Vue supplies the reactive lifecycle.
export { Switch } from './switch';
export type { ISwitchProps, ISwitchTrackColor } from '@symbiote/components';
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
export type { IButtonProps } from '@symbiote/components';
// TextInput. Full parity with React (the 3-layer split): the value/selection folds + the
// controlled-write predicate live in @symbiote/components; Vue supplies the reactivity
// (shallowRef host node, post-flush watch) + the imperative handle via expose().
export { TextInput } from './text-input';
export type { ITextInputProps, ITextInputHandle } from '@symbiote/components';
// VirtualizedList family. Full parity with React: the windowing math (visible range, cell
// keys, viewability token diffing, edge-reached, the list plan) is shared in
// @symbiote/components; Vue supplies the reactive lifecycle + the per-cell element.
export { VirtualizedList } from './virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListHandle,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  ICellLayout,
} from './virtualized-list';
export { FlatList } from './flat-list';
export type { IFlatListProps, IFlatListHandle } from './flat-list';
export { VirtualizedSectionList } from './virtualized-section-list';
export type { IVirtualizedSectionListHandle } from './virtualized-section-list';
export { SectionList } from './section-list';
export type { ISection, ISectionListHandle } from './section-list';
// DrawerLayoutAndroid (Android-only; iOS degrades to a plain container). Shared logic
// (types, command names, slide/state normalization, the imperative handle) in
// @symbiote/components; Vue supplies the platform-split lifecycle + the slots.
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
// engine.
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
// Style + Platform value types and the native-view-config seam: pure / seam-backed, so
// they live in the engine and both adapters re-export them (parity with the React adapter).
export type {
  IViewStyle,
  ITextStyle,
  IFlexAlign,
  IFlexJustify,
  IPlatformStatic,
  IPlatformOSType,
  IPlatformConstantsIOS,
  IPlatformConstantsAndroid,
  IPlatformSelectSpec,
} from '@symbiote/engine';
// Wired once by the app entry on a real host (like setColorProcessor): hands the engine
// RN's ViewConfig registry so third-party Fabric views auto-derive their metadata.
export { setNativeViewConfigSource } from '@symbiote/engine';
export type { INativeViewConfig, INativeViewConfigSource } from '@symbiote/engine';
// Pure utilities that moved to the engine (single source, both adapters re-export):
// PixelRatio + PanResponder, plus the color builders and the interaction scheduler.
export {
  PixelRatio,
  PanResponder,
  PlatformColor,
  DynamicColorIOS,
  InteractionManager,
} from '@symbiote/engine';
export type { IPixelRatioStatic } from '@symbiote/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiote/engine';
export type { IColorValue, IOpaqueColorValue, IDynamicColorIOSTuple } from '@symbiote/engine';
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
} from '@symbiote/engine';
