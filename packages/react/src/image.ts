// The Image primitive. Like View/Text it produces a host element the reconciler
// maps to a Fabric view name (`RCTImageView`). What's special: `source` must
// reach native as an ARRAY of {uri, scale?, width?, height?}, and `require()`
// asset sources arrive as opaque numbers that RN resolves to a uri. Resolution
// is RN-specific, so we inject it (setImageSourceResolver) to keep this module
// importable in plain Node, where react-native is absent.

import { createElement, type FC } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { ViewStyle } from './styles'

type ImageEventHandler = (event: SymbioteEvent) => void

export type ResizeMode = 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'

export interface ImageSource {
  uri?: string
  scale?: number
  width?: number
  height?: number
}

// A source is either a structured object/array (remote or pre-resolved) or an
// opaque asset id (the number `require('./x.png')` returns) the resolver expands.
export type ImageSourceProp = ImageSource | ImageSource[] | number

export interface ImageProps {
  source: ImageSourceProp
  defaultSource?: ImageSourceProp
  style?: ViewStyle
  resizeMode?: ResizeMode
  tintColor?: string
  blurRadius?: number
  onLoadStart?: ImageEventHandler
  onLoad?: ImageEventHandler
  onLoadEnd?: ImageEventHandler
  onError?: ImageEventHandler
  onProgress?: ImageEventHandler
  onPartialLoad?: ImageEventHandler
}

// Default resolver: identity. RN's resolveAssetSource (which turns a require()
// number into {uri, scale, width, height}) is wired in by the app at startup.
let resolveSource: (source: unknown) => unknown = (source) => source

export function setImageSourceResolver(resolve: (source: unknown) => unknown): void {
  resolveSource = resolve
}

// Resolve the source, then normalize to the array shape native expects. A single
// object/number becomes a one-element array; an already-array source passes through.
function normalizeSource(source: ImageSourceProp): unknown[] {
  const resolved = resolveSource(source)
  const sources = Array.isArray(resolved) ? resolved : [resolved]
  dlog(`Image source resolved to ${JSON.stringify(sources)}`)
  return sources
}

function readStyleString(style: ViewStyle | undefined, key: 'resizeMode' | 'tintColor'): string | undefined {
  if (style === undefined) return undefined
  const value = Object.hasOwn(style, key) ? Reflect.get(style, key) : undefined
  return typeof value === 'string' ? value : undefined
}

export const Image: FC<ImageProps> = (props) => {
  const { source, defaultSource, style, resizeMode, tintColor, ...rest } = props

  const mapped: Record<string, unknown> = {
    ...rest,
    style,
    source: normalizeSource(source),
    resizeMode: resizeMode ?? readStyleString(style, 'resizeMode'),
    tintColor: tintColor ?? readStyleString(style, 'tintColor'),
  }
  if (defaultSource !== undefined) mapped.defaultSource = normalizeSource(defaultSource)

  return createElement('symbiote-image', mapped)
}
