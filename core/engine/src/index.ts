// @symbiote-native/engine: the retained shadow-tree + clone-on-write commit engine.
// Every framework adapter drives this tiny mutation API; all Fabric-specific
// logic (tag allocation, view-name resolution, clone-on-write, event
// normalization) lives behind it, in one place.

export {
  createElement,
  createRawText,
  createAnchor,
  isAnchor,
  appendChild,
  insertBefore,
  removeChild,
  setProp,
  setEventListener,
  routeProp,
  getExplicitStyle,
  setText,
  isSymbioteNode,
  isSymbioteEvent,
  RAW_TEXT_COMPONENT,
} from './node';
export { isEventFor } from './view-config';
export { registerComponent, setNativeViewConfigSource } from './registry';
// Real cross-package consumer: core/components' KeyboardAvoidingView render narrows
// raw native payloads with this same guard, so it needs it off the package root.
export { isRecord } from './type-guards';
// InteractionManager: pure JS (timers + emitter), framework-agnostic, so it lives
// here; every adapter re-exports it.
export { InteractionManager, Events as InteractionManagerEvents } from './interaction-manager';
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
  ICancellable,
} from './interaction-manager';
// PanResponder: pure JS gesture recognition over the View responder props,
// framework-agnostic, so it lives here; every adapter re-exports it.
export { default as PanResponder } from './pan-responder';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from './pan-responder';
export type {
  IComponentRegistration,
  INativeEventBinding,
  INativeViewConfig,
  INativeViewConfigSource,
  IPropProcessor,
} from './registry';
export type { ISymbioteNode, ISymbioteEvent, IListener } from './node';

export { SymbioteSurface, createSurface } from './surface';
export { setEventDispatcher } from './dispatch';
export {
  setColorProcessor,
  processColor,
  dispatchViewCommand,
  sendAccessibilityEvent,
  setNativeProps,
  getNativeTag,
  getNativeNode,
  whenCommitted,
  measure,
  measureInWindow,
  measureLayout,
  disposeRoot,
} from './commit';
// The public instance grafted onto a host node by every adapter (React's getPublicInstance,
// the Vue renderer's createElement): the imperative measure/setNativeProps/focus API. Lives
// here because it depends only on engine internals, so all adapters inherit it identically.
export { toPublicInstance } from './host-instance';
export type { IHostInstance } from './host-instance';
export { PlatformColor, DynamicColorIOS, isOpaqueColorValue } from './platform-color';
export type { IColorValue, IOpaqueColorValue, IDynamicColorIOSTuple } from './platform-color';
// CSS-style processors (boxShadow/filter): RN parses these in JS before native because
// enableNativeCSSParsing() defaults to false. Exported so an adapter / test can reuse them.
export { processBoxShadow } from './process-box-shadow';
export type { IParsedBoxShadow } from './process-box-shadow';
export { processFilter } from './process-filter';
export type { IParsedFilter, IParsedDropShadow } from './process-filter';
export { processTransformOrigin } from './process-transform-origin';
export { processTransform } from './process-transform';
export { processAspectRatio } from './process-aspect-ratio';
export { processFontVariant } from './process-font-variant';
export { processBackgroundImage } from './process-background-image';
export type { IParsedBackgroundImage } from './process-background-image';
export { flattenStyle } from './style';
// The typed style surface: agnostic types, re-exported by every adapter (it used to
// live in @symbiote-native/react; moved here so @symbiote-native/components can type render fns).
export type {
  IViewStyle,
  ITextStyle,
  IStyleProp,
  IDimensionValue,
  IFlexAlign,
  IFlexJustify,
  ITransformProp,
  IBoxShadowValue,
  IDropShadowValue,
  IFilterFunction,
  IColorStopValue,
  ILinearGradientValue,
  IRadialGradientValue,
  IRadialGradientPosition,
  IRadialGradientShape,
  IRadialGradientSize,
  IBackgroundImageValue,
  IBlendMode,
} from './styles';
export { StyleSheet, computeHairlineWidth } from './style-sheet';
export {
  registerStyles,
  resolveClassName,
  clearGlobalStyles,
  isClassNameValue,
} from './style-registry';
export type { IClassNameValue } from './style-registry';
export { scopeClassName } from './style-registry/scope';
export type { IClassToggleMap, IScopableClassValue } from './style-registry/scope';
export { Platform } from './platform';
export type { IPlatformStatic, IPlatformOSType, IPlatformSelectSpec } from './platform';
// The per-platform constants types come from their own files, not the host-selected
// `./platform`: on an Android Metro build `./platform` IS platform.android.ts, which
// has no PlatformConstantsIOS. These are type-only (erased at runtime), so naming the
// explicit file pulls no cross-platform runtime code.
export type { IPlatformConstantsIOS } from './platform/index.ios';
export type { IPlatformConstantsAndroid } from './platform/index.android';
export { dlog, isDebug } from './debug';

export { getNativeModule, getEnforcingNativeModule } from './native-modules';
export { installDeviceEventHub, NativeEventEmitter, setDeviceEventSource } from './native-events';
export type {
  IEventSubscription,
  IEventEmitterModule,
  INativeEventListener,
  IDeviceEventSource,
} from './native-events';

export {
  AnimatedNode,
  AnimatedWithChildren,
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  AnimatedInterpolation,
  AnimatedAddition,
  AnimatedSubtraction,
  AnimatedMultiplication,
  AnimatedDivision,
  AnimatedModulo,
  AnimatedDiffClamp,
  AnimatedEvent,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
  attachNativeEvent,
  attachNativeEventHandler,
  flushValue,
  Easing,
  createNumericInterpolation,
  checkValidRanges,
  TimingAnimation,
  SpringAnimation,
  DecayAnimation,
  AnimatedTracking,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  nativeAnimated,
  isNativeAnimatedAvailable,
  AnimatedProps,
  AnimatedStyle,
  AnimatedTransform,
  AnimatedMock,
  reduceProps,
  isAnimatedNode,
  readPassthroughStyle,
  resolveHostNode,
} from './animated';
export type {
  IValueXY,
  IRgbaValue,
  IColorInput,
  IEventConfig,
  IEventListener,
  IAnimatedEventHandler,
  INativeEventAttachment,
  IValueListener,
  IEasingFunction,
  IInterpolationConfig,
  IExtrapolateType,
  IAnimation,
  IEndCallback,
  IEndResult,
  ICompositeAnimation,
  ITimingConfig,
  ISpringConfig,
  IDecayConfig,
  IParallelConfig,
  ILoopAnimationConfig,
  INativeNodeConfig,
  INativeAnimationConfig,
  INativeEventMapping,
  IPlatformConfig,
} from './animated';

export { getSlot } from './fabric';
export type {
  IFabricSlot,
  IFabricNode,
  IFabricChildSet,
  IFabricProps,
  IFabricEventHandler,
  IRootTag,
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric';

// Imperative runtime modules: framework-agnostic native-bridge consumers (no visual, no
// lifecycle), moved here from @symbiote-native/react so every adapter re-exports the SAME module.
// The native module a JS API talks to is chosen per platform and can only be confirmed on a
// real device or simulator, not headless (a headless fake resolves any module name).
export { Alert } from './alert';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
} from './alert';
export { Share } from './share';
export type { IShareContent, IShareOptions, IShareAction } from './share';
// Image statics (getSize/prefetch/queryCache/…): a stateful, native-bridge-touching module with
// no view of its own, same shape as Alert/Share. The source-resolution seam it shares with
// @symbiote-native/components' renderImage lives alongside it in image-source-resolver.
export { imageStatics } from './image-loader';
export type { IImageStatics, IImageSize, IImageCacheStatus } from './image-loader';
export { setImageSourceResolver, resolveImageSource } from './image-source-resolver';
export type { IImageSource, IImageSourceProp } from './image-source-resolver';
export { ActionSheetIOS } from './action-sheet-ios';
export type {
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
} from './action-sheet-ios';
export { Linking } from './linking';
export type { IUrlEvent } from './linking';
export { Vibration } from './vibration';
export { ToastAndroid } from './toast-android';
export { Settings } from './settings';
export { I18nManager } from './i18n-manager';
export type { II18nManagerConstants } from './i18n-manager';

// Device-state / event modules (Dimensions, Appearance, AppState, Keyboard, …).
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
// PixelRatio: derives from the Dimensions singleton, framework-agnostic, so it lives
// here; every adapter re-exports it.
export { PixelRatio } from './pixel-ratio';
export type { IPixelRatioStatic } from './pixel-ratio';
export { Appearance } from './appearance';
export type { IColorSchemeName, IColorSchemePreference } from './appearance';
export { AppState } from './app-state';
export type { IAppStateStatus, IAppStateEvent } from './app-state';
// AppRegistry core: registry bookkeeping + host-registrar bridge + headless tasks, shared by
// every adapter. Each adapter calls createAppRegistry with its own runnableFor (the one
// framework-specific seam — how to build a runnable from a component provider).
export { createAppRegistry } from './app-registry';
export type {
  IAppRegistry,
  ICreateAppRegistryResult,
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from './app-registry';
export { Keyboard, KEYBOARD_EVENT } from './keyboard';
export type { IKeyboardEventName, IKeyboardEvent, IKeyboardMetrics } from './keyboard';
export {
  currentlyFocusedInput,
  setInputFocused,
  setInputBlurred,
  blurTextInput,
} from './text-input-state';
export { LayoutAnimation } from './layout-animation';
export type {
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
  ILayoutAnimationTypes,
  ILayoutAnimationProperties,
} from './layout-animation';
export { BackHandler } from './back-handler';
export type { IBackPressEventName, IBackPressHandler } from './back-handler';
export { PermissionsAndroid, PERMISSIONS, RESULTS } from './permissions-android';
export type { IPermission, IPermissionStatus, IRationale } from './permissions-android';
export { AccessibilityInfo } from './accessibility-info';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityInfoStatic,
  IAccessibilityEventType,
  IAccessibilityHandle,
} from './accessibility-info/shared';
// StatusBar: values from the platform-selected './status-bar', types from '-shared' (the
// .ios re-export would otherwise duplicate-export the type symbols).
export { applyStatusBarProps, statusBarImperative, statusBarCurrentHeight } from './status-bar';
export {
  hideTransition,
  STATUS_BAR_MANAGER,
  ANIMATED_HIDE_TRANSITION,
  STATIC_HIDE_TRANSITION,
} from './status-bar/shared';
export type {
  IStatusBarProps,
  IStatusBarStyle,
  IStatusBarAnimation,
  IStatusBarImperative,
} from './status-bar/shared';
