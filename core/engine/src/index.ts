// @symbiote/engine: the retained shadow-tree + clone-on-write commit engine.
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
  setText,
  isSymbioteNode,
  RAW_TEXT_COMPONENT,
} from './node';
export { isEventFor } from './view-config';
export { registerComponent, setNativeViewConfigSource } from './registry';
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
export { flattenStyle } from './style';
// The typed style surface: agnostic types, re-exported by every adapter (it used to
// live in @symbiote/react; moved here so @symbiote/components can type render fns).
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
  IBlendMode,
} from './styles';
export { StyleSheet, computeHairlineWidth } from './style-sheet';
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
// lifecycle), moved here from @symbiote/react so every adapter re-exports the SAME module.
// Native module names are platform-selected and device-verified, not headless (CLAUDE.md
// <native_module_name_is_platform_specific>).
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
