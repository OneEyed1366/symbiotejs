// @symbiote/react — a react-reconciler host config (mutation mode) over
// @symbiote/shared. React is a known-good driver: it proves the native pipe
// (R1) and shared's clone-on-write engine (R2) before any non-React adapter.

export { View, Text } from './components'
export type { ViewProps, TextProps } from './components'
export { Image, setImageSourceResolver } from './image'
export type { ImageProps, ImageSource, ImageSourceProp, ResizeMode } from './image'
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

// Framework-agnostic runtime utilities live in shared; the adapter re-exports them
// so app code names only @symbiote/react (RN's surface, one import root).
export { Platform, StyleSheet } from '@symbiote/shared'
// Wired once by the app entry on a real host (like setColorProcessor): hands shared
// RN's ViewConfig registry so third-party Fabric views auto-derive their metadata —
//   setNativeViewConfigSource(name => ReactNativeViewConfigRegistry.get(name))
export { setNativeViewConfigSource } from '@symbiote/shared'
export type { NativeViewConfig, NativeViewConfigSource } from '@symbiote/shared'
export type {
  PlatformStatic,
  PlatformOSType,
  PlatformConstantsIOS,
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

export type { SymbioteEvent } from '@symbiote/shared'
