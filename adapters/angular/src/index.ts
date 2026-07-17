// @symbiote-native/angular: a thin Angular reconciler over @symbiote-native/engine. A custom Renderer2 +
// RendererFactory2 map each node op onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote-native/angular.
//
// SEAM SCAFFOLD: mount/unmount + the renderer seam + host intrinsic selectors. Full RN-like
// composed components still flow through the shared @symbiote-native/components bridge.

export {
  ActivityIndicator,
  anchorHostStyle,
  Button,
  FlatList,
  HorizontalScrollContentView,
  HorizontalScrollView,
  Image,
  ImageBackground,
  InputAccessoryView,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollContentView,
  ScrollView,
  ScrollViewStickyHeader,
  SectionList,
  stableAnchorStyle,
  Switch,
  SymbioteHostPropsDirective,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableNativeFeedback,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  VirtualizedList,
  VirtualizedSectionList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './components';
export { Animated } from './modules/animated';
// Also exposed as named top-level symbols (not just Animated.View/.Text/...): ngtsc's partial-mode
// static evaluator can't trace a component class through property access on an external
// namespace object, only through a direct named import binding —
// so `<AnimatedView>` in a template requires `import { AnimatedView } from '@symbiote-native/angular'`,
// not `const AnimatedView = Animated.View`. Plain tsc/vitest don't catch this; only a real ngc run does.
export {
  AnimatedFlatList,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedSectionList,
  AnimatedText,
  AnimatedView,
} from './modules/animated';
export type {
  IActivityIndicatorProps,
  IAngularImageBackgroundProps,
  IAngularInputAccessoryViewProps,
  IAngularKeyboardAvoidingViewProps,
  IAngularModalProps,
  IAngularPressableProps,
  IAngularRefreshControlProps,
  IAngularSafeAreaViewProps,
  IAngularScrollViewProps,
  IAngularTextInputProps,
  IAngularTouchableHighlightProps,
  IAngularTouchableNativeFeedbackProps,
  IAngularTouchableOpacityProps,
  IAngularTouchableWithoutFeedbackProps,
  IButtonProps,
  ICellLayout,
  IFlatListHandle,
  IFlatListProps,
  IEnterKeyHint,
  IImageCacheStatus,
  IImageProps,
  IImageSize,
  IImageSource,
  IImageSourceProp,
  IInputMode,
  IKeyboardAvoidingBehavior,
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
  INativeFeedbackBackground,
  IResizeMode,
  IRippleBackground,
  IScrollViewHandle,
  ISectionListHandle,
  ISectionListProps,
  ISeparatorProps,
  ISeparators,
  IStickyHeaderComponentType,
  ISubmitBehavior,
  IThemeAttrBackground,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
  IViewToken,
  IVirtualizedListHandle,
  IVirtualizedListProps,
  IVirtualizedSectionListHandle,
  IVirtualizedSectionListProps,
  IVListItemContext,
  IVListSeparatorContext,
  IVSectionContext,
  IVSectionItemContext,
  ISection,
  ISwitchProps,
  ISwitchTrackColor,
  ITextInputHandle,
  ITextInputSelection,
} from './components';
export { setImageSourceResolver } from './components';
export { mount, unmount } from './render';
// The generic Descriptor→Angular bridge, the twin of descriptorToReact/descriptorToVue.
// Exported so a component defined OUTSIDE this package (e.g.
// @symbiote-native/slider) can render a shared @symbiote-native/components/@symbiote-native/slider Descriptor tree
// without hand-writing its own Renderer2 walker.
export { DescriptorOutlet } from './descriptor-to-angular';
// createPortal (same-surface only — see the file header) and createTunnel (cross-surface,
// see its file header) are the Angular twins of the React/Vue portal/tunnel primitives.
// Angular can't synthesize components at runtime (no JIT under Metro/Hermes), so both are
// static, pre-authored structural directives (`*portal`/`*tunnelIn`, the `*ngIf`/`*ngFor`
// idiom) parameterized by an `@Input()`, rather than a factory returning fresh components per
// call.
export { PortalDirective, PortalOutletDirective } from './create-portal';
export { createTunnel, TunnelInDirective, TunnelOut, type ITunnelStore } from './create-tunnel';
export { SymbioteRenderer, SymbioteRendererFactory } from './renderer';
// registerComposedComponent lives in the dependency-free leaf ./anchor-host-registry, NOT in the
// require-cyclic ./renderer — see the leaf header. The babel-register-composed plugin injects the
// import straight from that subpath so app-screen registration never routes through this cyclic
// barrel.
export { registerComposedComponent } from './anchor-host-registry';
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
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
export { ColorSchemeService, WindowDimensionsService } from './services';

// Framework-agnostic runtime modules from @symbiote-native/engine. Every adapter re-exports them so
// app code names only @symbiote-native/angular.
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
  InteractionManager,
  PanResponder,
  PixelRatio,
  PlatformColor,
  DynamicColorIOS,
} from '@symbiote-native/engine';
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
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
  IPixelRatioStatic,
  IColorValue,
  IOpaqueColorValue,
  IDynamicColorIOSTuple,
} from '@symbiote-native/engine';
export {
  dlog,
  flattenStyle,
  isDebug,
  Platform,
  processColor,
  setColorProcessor,
  setDeviceEventSource,
  setNativeViewConfigSource,
  StyleSheet,
} from '@symbiote-native/engine';
export type { IRootTag, ISymbioteEvent, ISymbioteNode } from '@symbiote-native/engine';
