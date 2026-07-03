// @symbiotejs/vue: a thin Vue 3 reconciler over @symbiotejs/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiotejs/vue.

export { mount, unmount } from './render';
// createTunnel: cross-surface content sharing (Teleport stays same-surface-only by design —
// see create-tunnel.ts and the vue-adapter-directives skill for why).
export { createTunnel, type ITunnel } from './create-tunnel';
export { View, Text } from './components';
// Accessibility / ARIA prop types: framework-agnostic, shared verbatim from
// @symbiotejs/components (the same source the React adapter re-exports).
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
} from '@symbiotejs/components';
// findNodeHandle: RN's ref -> native reactTag lookup, the Vue twin of the React adapter's
// host-instance resolution. IHostInstance is the raw engine node (Vue host refs fall
// through to it; imperative methods live on each component's expose() handle).
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
// Image. Full parity with React: source/src/srcSet resolution, the width/height → style fold,
// alt → accessibility, and the Image statics (getSize / prefetch / queryCache / …) are shared
// verbatim from @symbiotejs/components via renderImage; Vue supplies only the functional bridge.
export { Image, setImageSourceResolver } from './components/image';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './components/image';
// First component off the shared @symbiotejs/components layer: render-only, drives the
// agnostic renderActivityIndicator through descriptorToVue. Proof the layer is reusable:
// the render fn is shared verbatim with React; Vue supplies only the bridge.
export { ActivityIndicator } from './components/activity-indicator';
export type { IActivityIndicatorProps } from './components/activity-indicator';
// First component to bring the state half into Vue (the lastNativeReport reducer + the
// snap-back watch); render shared verbatim with React, Vue supplies the reactive lifecycle.
export { Switch } from './components/switch';
export type { ISwitchProps, ISwitchTrackColor } from './components/switch';
// ScrollView. Full parity (ADR 0024): vertical + horizontal, every pass-through prop, the
// synthesized onContentSizeChange, the imperative handle via expose() + shallowRef, RefreshControl
// (iOS sibling / Android wrap, Phase 2), and sticky headers (Phase 3: the scroll AnimatedValue,
// the headerLayoutYs cross-talk, and the per-header Animated.View wrap). The pure math (intrinsics,
// decelerationRate, content-size dedupe, the handle, the sticky interpolation) is shared verbatim
// with React from @symbiotejs/components.
export { ScrollView } from './components/scroll-view';
export type {
  IScrollViewProps,
  IScrollViewEmits,
  IScrollViewHandle,
} from './components/scroll-view';
// Pressable family. Full parity with React (the 3-layer split): the press state machine + render
// decisions are shared in @symbiotejs/components; Vue supplies the reactivity + descriptor bridge.
export { Pressable } from './components/pressable';
export type {
  IPressableProps,
  IPressableSlots,
  IPressState,
  IPressableAndroidRippleConfig,
} from './components/pressable';
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
export { TouchableNativeFeedback } from './components/touchable-native-feedback';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
  ITouchableNativeFeedbackProps,
} from './components/touchable-native-feedback';
export { Button } from './components/button';
export type { IButtonProps } from './components/button';
// TextInput. Full parity with React (the 3-layer split): the value/selection folds + the
// controlled-write predicate live in @symbiotejs/components; Vue supplies the reactivity
// (shallowRef host node, post-flush watch) + the imperative handle via expose().
export { TextInput } from './components/text-input';
export type { ITextInputProps, ITextInputHandle } from './components/text-input';
// VirtualizedList family. Full parity with React: the windowing math (visible range, cell
// keys, viewability token diffing, edge-reached, the list plan) is shared in
// @symbiotejs/components; Vue supplies the reactive lifecycle + the per-cell element.
export { VirtualizedList } from './components/virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListSlots,
  IVirtualizedListEmits,
  IVirtualizedListHandle,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  ICellLayout,
} from './components/virtualized-list';
export { FlatList } from './components/flat-list';
export type {
  IFlatListProps,
  IFlatListSlots,
  IFlatListEmits,
  IFlatListHandle,
} from './components/flat-list';
export { VirtualizedSectionList } from './components/virtualized-section-list';
export type {
  IVirtualizedSectionListProps,
  IVirtualizedSectionListSlots,
  IVirtualizedSectionListEmits,
  IVirtualizedSectionListHandle,
} from './components/virtualized-section-list';
export { SectionList } from './components/section-list';
export type {
  ISection,
  ISectionListProps,
  ISectionListSlots,
  ISectionListEmits,
  ISectionListHandle,
} from './components/section-list';
// Phase 2 (ADR 0024): SafeAreaView + RefreshControl, wired into ScrollView with the iOS-sibling /
// Android-wrap platform split. RefreshControl hosts the wrapped scroll view via its default slot.
export { SafeAreaView } from './components/safe-area-view';
export type { ISafeAreaViewProps } from './components/safe-area-view';
export { RefreshControl } from './components/refresh-control';
export type { IRefreshControlProps, IRefreshControlEmits } from './components/refresh-control';
export { descriptorToVue } from './descriptor-to-vue';
// normalizeVueAttrs: the kebab→camel attr fold every component applies at entry. Exported so an
// external wrapper package (e.g. @symbiotejs/slider/vue over a third-party native view) can fold
// its incoming attrs through the SAME transform rather than reimplementing it.
export { normalizeVueAttrs } from './utils/normalize-attrs';
// resolveModelValue/emitModelUpdate: the v-model (Rule 6, vue-adapter-events skill) helper every
// controlled-value component uses. Exported for the same external-package reason as
// normalizeVueAttrs above (e.g. @symbiotejs/slider/vue).
export { resolveModelValue, emitModelUpdate } from './utils/model-binding';
export { createSymbioteRenderer } from './renderer';
// Animated (ADR 0024 Phase 3a): Animated.View/Text/Image + the lazy Animated.ScrollView over the
// Vue primitives, with the value graph / easing / drivers spread from @symbiotejs/engine. The wrap
// mechanism (createAnimatedComponent) is the Vue twin of React's; the pure leaves live in the
// engine.
export { Animated, createAnimatedComponent } from './modules/animated';

// Visual components off the shared @symbiotejs/components layer (wave: simple-visual).
export { ImageBackground } from './components/image-background';
export type { IImageBackgroundProps } from './components/image-background';
export { InputAccessoryView } from './components/input-accessory-view';
export type { IInputAccessoryViewProps } from './components/input-accessory-view';
export { Modal } from './components/modal';
export type {
  IModalProps,
  IModalEmits,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from './components/modal';
// KeyboardAvoidingView: full parity via the shared inset math; Vue owns the Keyboard subscription.
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IKeyboardAvoidingBehavior,
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingViewEmits,
} from './components/keyboard-avoiding-view';
// StatusBar: declarative component + the shared imperative API.
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';
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
// Vue composables over the core device-state modules.
export { useColorScheme } from './composables/use-color-scheme';
export { useWindowDimensions } from './composables/use-window-dimensions';

// Imperative runtime modules: the SAME module both adapters share, re-exported from @symbiotejs/engine.
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
} from '@symbiotejs/engine';
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
} from '@symbiotejs/engine';

// Re-export the framework-agnostic engine surface (pure utilities + diagnostics).
export {
  Platform,
  StyleSheet,
  processColor,
  setColorProcessor,
  dlog,
  isDebug,
} from '@symbiotejs/engine';
export type { ISymbioteEvent, ISymbioteNode, IRootTag } from '@symbiotejs/engine';
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
} from '@symbiotejs/engine';
// Wired once by the app entry on a real host (like setColorProcessor): hands the engine
// RN's ViewConfig registry so third-party Fabric views auto-derive their metadata.
export { setNativeViewConfigSource } from '@symbiotejs/engine';
export type { INativeViewConfig, INativeViewConfigSource } from '@symbiotejs/engine';
// Pure utilities that moved to the engine (single source, both adapters re-export):
// PixelRatio + PanResponder, plus the color builders and the interaction scheduler.
export {
  PixelRatio,
  PanResponder,
  PlatformColor,
  DynamicColorIOS,
  InteractionManager,
} from '@symbiotejs/engine';
export type { IPixelRatioStatic } from '@symbiotejs/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiotejs/engine';
export type { IColorValue, IOpaqueColorValue, IDynamicColorIOSTuple } from '@symbiotejs/engine';
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
} from '@symbiotejs/engine';
