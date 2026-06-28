// @symbiote/components: the framework-agnostic component layer. Pure state machines
// (`state/`) and render functions (`view/`) that paint `Descriptor` trees; every adapter
// wires state→render with ITS lifecycle (React hooks / Vue reactivity) and maps the
// Descriptor onto its own element. See CLAUDE.md <components_split_logic_view_lifecycle>.

export { el, txt } from './descriptor';
export type {
  IDescriptor,
  IDescriptorType,
  IDescriptorProps,
  IDescriptorChild,
} from './descriptor';

// Accessibility folding: the web-alias (aria-*/role) → canonical accessibility* transform
// and its types. Framework-agnostic (ADR 0024), so React, Vue, and the next adapter all fold
// identically; moved here from @symbiote/react. RefreshControl/SafeAreaView/ScrollView consume it.
export { resolveAccessibilityProps } from './accessibility-props';
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
} from './accessibility-props';

// Intrinsic (`symbiote-*`) → Fabric view-name resolution. Shared by every adapter so the
// names CANNOT drift between them (one engine, one Fabric). The name tables are
// Metro-split (.ios/.android, filename selects, no Platform.OS read, ADR 0020); the base
// re-exports iOS for headless. descriptorFor is the per-platform-bound resolver.
export { descriptorFor, COMPONENT_DESCRIPTORS } from './component-names';
export { buildDescriptors, makeDescriptorFor } from './component-names/shared';
export type { ISymbioteIntrinsic, IComponentDescriptor } from './component-names/shared';

export { renderActivityIndicator } from './view/render-activity-indicator';
export type {
  IActivityIndicatorViewProps,
  IActivityIndicatorPlatform,
  IActivityIndicatorSize,
} from './view/render-activity-indicator';

export { renderSwitch } from './view/render-switch';
export type { ISwitchViewProps, ISwitchPlatform, ISwitchTrackColor } from './view/render-switch';

// Switch is the first STATE machine off this layer (ActivityIndicator was render-only):
// the reducer + the two pure predicates are the logic half, the adapter supplies the hook.
export {
  switchReducer,
  createInitialSwitchState,
  shouldSnapBack,
  valueFromChange,
} from './state/switch';
export type { ISwitchState, ISwitchAction } from './state/switch';

// ScrollView: pure render/command helpers (no state machine, no 3-layer split). The adapter
// owns the refs/effects/element assembly and the sticky-header component; these supply the
// platform-invariant math and plumbing every adapter shares (ADR 0024).
export {
  resolveDecelerationRate,
  selectScrollIntrinsics,
  readLayoutDimension,
  didContentSizeChange,
  SCROLL_VIEW_BASE_HORIZONTAL,
  SCROLL_VIEW_BASE_VERTICAL,
} from './view/render-scroll-view';
export type { IScrollIntrinsics, IContentSize } from './view/render-scroll-view';

export {
  buildScrollViewHandle,
  splitLayoutProps,
  attachStickyScroll,
  isSymbioteEvent,
  forwardScrollEvent,
} from './scroll-view-commands';
export type { IScrollViewHandle } from './scroll-view-commands';

export {
  computeStickyInterpolation,
  nextStickyHeaderY,
  stickyDebounceMs,
  readLayoutNumber,
  STICKY_HEADER_Z_INDEX,
} from './view/render-scroll-sticky';
export type { IStickyHeaderProps, IStickyInterpolationParams } from './view/render-scroll-sticky';

export type {
  IImageSource,
  IImageStatics,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
  IImageProps,
  IImageViewProps,
} from './view/render-image';
export { renderImage, imageStatics, setImageSourceResolver } from './view/render-image';

// ImageBackground: render-only composition (absolute-fill image behind, children on top).
export { renderImageBackground } from './view/render-image-background';
export type { IImageBackgroundViewProps } from './view/render-image-background';

// InputAccessoryView: render-only host assembly (nativeID/backgroundColor).
export { renderInputAccessoryView } from './view/render-input-accessory-view';
export type { IInputAccessoryViewViewProps } from './view/render-input-accessory-view';

// Modal: full 3-layer split (state machine gates the iOS keep-alive frame).
export { renderModal } from './view/render-modal';
export type {
  IModalViewProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from './view/render-modal';
export { modalReducer, createInitialModalState, shouldRenderModal } from './state/modal';
export type { IModalState, IModalAction } from './state/modal';

// KeyboardAvoidingView: pure inset/behavior math; the adapter owns the Keyboard subscription.
export {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
} from './view/render-keyboard-avoiding-view';
export type {
  IKeyboardAvoidingBehavior,
  IMeasuredFrame,
  IKeyboardFrame,
  IKeyboardAvoidingLayout,
  IResolveKeyboardAvoidingLayoutParams,
} from './view/render-keyboard-avoiding-view';

// Pressable: the press state machine (logic) + render decisions. The pure lifecycle (timers,
// geometry, drift test, suppression flags) lives in state/pressable; the responder-listener +
// accessibilityState + ripple render decisions in view/render-pressable. Every adapter supplies
// only its reactive `pressed` cell + the View's measure handle (see the 3-layer split).
export {
  createPressHandlers,
  createPressRuntime,
  normalizeRect,
  maxEdge,
  isTouchWithinRegion,
  readPoint,
  computeRegion,
  rippleProps,
  DEFAULT_DELAY_LONG_PRESS_MS,
  DEFAULT_PRESS_RECT_OFFSETS,
} from './state/pressable';
export type {
  IPressState,
  IPressHandler,
  IPressHandlers,
  IPressHost,
  IPressRuntime,
  IPressMachineConfig,
  IFrameCallback,
  IRectOffset,
  IEdgeInsets,
  IResponderRegion,
  IPressableAndroidRippleConfig,
  IRippleBackground as IPressableRippleBackground,
} from './state/pressable';
export {
  buildPressableListeners,
  resolveDisabledAccessibilityState,
  noteHoverNoop,
} from './view/render-pressable';

// Touchable*: shared press-timing constants + the deactivation-floor math (the Animated feedback
// itself stays per-adapter), and TouchableNativeFeedback's pure static factories + background map.
export {
  computePressOutWait,
  DEFAULT_ACTIVE_OPACITY,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_UNDERLAY_COLOR,
  DEFAULT_MIN_PRESS_DURATION_MS,
} from './state/touchable';
export type { IPressTimingProps, ITouchableHandler } from './state/touchable';
export {
  backgroundProps,
  canUseNativeForeground,
  selectableBackground,
  selectableBackgroundBorderless,
  rippleBackground,
} from './view/render-touchable-native-feedback';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './view/render-touchable-native-feedback';

// Button: shared base text style, role constant, and color fold (the adapter composes its own
// TouchableOpacity + Text).
export {
  BUTTON_ACCESSIBILITY_ROLE,
  buttonTextStyle,
  resolveButtonTextStyle,
} from './view/render-button';

// TextInput: the controlled-value / event-count handshake. The logic half is the pure
// folds/maps + the controlled-write predicate (not a single reducer: count must re-render the
// imperative handle, lastNativeText must not); the view half picks the intrinsic and maps the
// resolved native props. Both shared verbatim across React and Vue; the adapter owns only the
// hooks/reactivity + the imperative handle.
export {
  resolveTextInputProps,
  foldText,
  foldAutoComplete,
  foldSubmitBehavior,
  mapAutoComplete,
  textFromChange,
  eventCountFromChange,
  shouldCommandText,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
} from './state/text-input';
export type {
  ITextInputProps,
  ITextInputHandle,
  ITextInputSelection,
  ITextInputEventHandler,
  ITextInputFoldInput,
  IFoldedTextInputProps,
  IInputMode,
  IEnterKeyHint,
  ISubmitBehavior,
} from './state/text-input';
export { renderTextInput } from './view/render-text-input';
export type { ITextInputViewProps } from './view/render-text-input';
