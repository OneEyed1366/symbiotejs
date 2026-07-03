// Angular component surface over Symbiote intrinsics. Public tags (`View`, `Text`) are
// ergonomic aliases of the primitive hosts in `../primitives`; engine intrinsics (`symbiote-*`)
// are the actual Angular primitive host components. Every primitive host declares `style` as a
// real Angular input so RN `StyleProp` arrays/objects are flattened and forwarded through the
// custom renderer, instead of being misinterpreted by Angular's CSS style engine.

export { ActivityIndicator } from './components/activity-indicator';
export type { IActivityIndicatorProps } from './components/activity-indicator';
export { Image, setImageSourceResolver } from './components/image';
export { InputAccessoryView } from './components/input-accessory-view';
export type { IAngularInputAccessoryViewProps } from './components/input-accessory-view';
export { Modal } from './components/modal';
export type {
  IAngularModalProps,
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
} from './components/modal';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './components/image';
export { Pressable } from './components/pressable';
export type { IAngularPressableProps } from './components/pressable';
export { SafeAreaView } from './components/safe-area-view';
export type { IAngularSafeAreaViewProps } from './components/safe-area-view';
export { Switch } from './components/switch';
export type { ISwitchProps, ISwitchTrackColor } from './components/switch';
export { ImageBackground } from './components/image-background';
export type { IAngularImageBackgroundProps } from './components/image-background';
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IAngularKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './components/keyboard-avoiding-view';
export { RefreshControl } from './components/refresh-control';
export type { IAngularRefreshControlProps } from './components/refresh-control';
export { TextInput } from './components/text-input';
export type {
  IAngularTextInputProps,
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
  ITextInputHandle,
  ITextInputSelection,
} from './components/text-input';
export { TouchableNativeFeedback } from './components/touchable-native-feedback';
export type {
  IAngularTouchableNativeFeedbackProps,
  INativeFeedbackBackground,
  IRippleBackground,
  IThemeAttrBackground,
} from './components/touchable-native-feedback';
export {
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from './components/touchable';
export type {
  IAngularTouchableHighlightProps,
  IAngularTouchableOpacityProps,
  IAngularTouchableWithoutFeedbackProps,
} from './components/touchable';
export { ScrollView, ScrollViewStickyHeader } from './components/scroll-view';
export type {
  IAngularScrollViewProps,
  IScrollViewHandle,
  IStickyHeaderComponentType,
} from './components/scroll-view';
export { Button } from './components/button';
export type { IButtonProps } from './components/button';
export {
  VirtualizedList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from './components/virtualized-list';
export type {
  ICellLayout,
  ISeparatorProps,
  ISeparators,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
  IViewToken,
  IVirtualizedListHandle,
  IVirtualizedListProps,
  IVListItemContext,
  IVListSeparatorContext,
} from './components/virtualized-list';
export { FlatList } from './components/flat-list';
export type { IFlatListHandle, IFlatListProps } from './components/flat-list';
export {
  VirtualizedSectionList,
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './components/virtualized-section-list';
export type {
  ISection,
  IVirtualizedSectionListHandle,
  IVirtualizedSectionListProps,
  IVSectionContext,
  IVSectionItemContext,
} from './components/virtualized-section-list';
export { SectionList } from './components/section-list';
export type { ISectionListHandle, ISectionListProps } from './components/section-list';

// Re-export primitive hosts so composed components can import them from the public barrel too.
export {
  ViewHost,
  ViewHost as View,
  TextHost,
  TextHost as Text,
  ImageHost,
  ScrollViewHost,
  ScrollContentView,
  HorizontalScrollView,
  HorizontalScrollContentView,
  TextInputHost,
  MultilineTextInputHost,
  SwitchHost,
  ActivityIndicatorHost,
  SafeAreaViewHost,
  ModalHost,
  RefreshControlHost,
  InputAccessoryViewHost,
  SymbioteHostPropsDirective,
  // Exported so an OUT-OF-PACKAGE composed component (e.g. @symbiotejs/slider's Angular wrapper,
  // itself listed in ANCHOR_HOST_COMPONENTS) can merge its own anchor host's class-derived style
  // the same way every in-package composed component does — see anchorHostStyle's doc comment.
  anchorHostStyle,
  // Same reasoning, for a component whose merged style is reassigned unconditionally every CD
  // tick (rather than read once inside a props-object getter) — see stableAnchorStyle's doc
  // comment for the free-running-CD-loop it prevents.
  stableAnchorStyle,
} from './primitives/index';

// Public ergonomic aliases: <View> and <Text> resolve directly to the primitive hosts
// (no extra Angular bookkeeping anchor), while the internal symbiote-* selectors remain
// available for composed adapter templates.
