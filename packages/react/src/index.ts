// @symbiote/react — a react-reconciler host config (mutation mode) over
// @symbiote/shared. React is a known-good driver: it proves the native pipe
// (R1) and shared's clone-on-write engine (R2) before any non-React adapter.

export { View, Text } from './components'
export type { ViewProps, TextProps } from './components'
export { Image, setImageSourceResolver } from './image'
export type { ImageProps, ImageSource, ImageSourceProp, ResizeMode } from './image'
export { ScrollView } from './scroll-view'
export type { ScrollViewProps } from './scroll-view'
export { TextInput } from './text-input'
export type { TextInputProps } from './text-input'
export type { ViewStyle, TextStyle, FlexAlign, FlexJustify } from './styles'
export { mount } from './render'

export type { SymbioteEvent } from '@symbiote/shared'
