// AnimatedColor — animate a color by driving four channel values (r, g, b, a). Its
// __getValue() is an `rgba(...)` string, which the commit layer's injected color
// processor turns into the platform int Fabric wants. Ported from RN's
// AnimatedColor.js: the {r,g,b,a} and CSS-color input forms are supported; named
// colors and platform (Native) colors are deferred (they need RN's full
// normalizeColor / processColorObject, which live outside shared).

import { AnimatedWithChildren } from './graph'
import { AnimatedValue } from './value'
import type { NativeNodeConfig } from './native/native-animated'

export interface RgbaValue {
  r: number
  g: number
  b: number
  a: number
}

type Channel = number | AnimatedValue
interface RgbaInput {
  r: Channel
  g: Channel
  b: Channel
  a: Channel
}
export type ColorInput = RgbaInput | RgbaValue | string | number

const DEFAULT_COLOR: RgbaValue = { r: 0, g: 0, b: 0, a: 1 }

function isRgbaInput(value: ColorInput): value is RgbaInput {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value
}

function toChannel(value: Channel): AnimatedValue {
  return value instanceof AnimatedValue ? value : new AnimatedValue(value)
}

// Decompose a #hex (3/4/6/8), rgb()/rgba(), or 0xRRGGBBAA number into channels.
// undefined when unparseable (a named/platform color), so the caller falls back to
// the default rather than throwing inside a render.
function normalizeColor(color: string | number): RgbaValue | undefined {
  if (typeof color === 'number') {
    const c = color >>> 0
    return { r: (c >>> 24) & 255, g: (c >>> 16) & 255, b: (c >>> 8) & 255, a: (c & 255) / 255 }
  }
  const trimmed = color.trim()
  if (trimmed.startsWith('#')) return parseHex(trimmed)
  if (/^rgba?\(/i.test(trimmed)) return parseRgb(trimmed)
  return undefined
}

function parseHex(hex: string): RgbaValue | undefined {
  let body = hex.slice(1)
  if (body.length === 3 || body.length === 4) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (body.length !== 6 && body.length !== 8) return undefined
  const int = Number.parseInt(body, 16)
  if (Number.isNaN(int)) return undefined
  if (body.length === 6) {
    return { r: (int >>> 16) & 255, g: (int >>> 8) & 255, b: int & 255, a: 1 }
  }
  const c = int >>> 0
  return { r: (c >>> 24) & 255, g: (c >>> 16) & 255, b: (c >>> 8) & 255, a: (c & 255) / 255 }
}

function parseRgb(str: string): RgbaValue | undefined {
  const match = /^rgba?\(([^)]+)\)$/i.exec(str)
  if (match === null) return undefined
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return undefined
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 }
}

// Resolve any input form to four concrete channel values (numbers or pre-built
// AnimatedValues), so the constructor can wrap each in an AnimatedValue.
function resolveInput(value?: ColorInput): RgbaInput {
  if (value === undefined) return DEFAULT_COLOR
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeColor(value) ?? DEFAULT_COLOR
  }
  if (isRgbaInput(value)) return value
  return DEFAULT_COLOR
}

export class AnimatedColor extends AnimatedWithChildren {
  readonly r: AnimatedValue
  readonly g: AnimatedValue
  readonly b: AnimatedValue
  readonly a: AnimatedValue

  constructor(value?: ColorInput) {
    super()
    const input = resolveInput(value)
    this.r = toChannel(input.r)
    this.g = toChannel(input.g)
    this.b = toChannel(input.b)
    this.a = toChannel(input.a)
  }

  // The CSS color string the commit layer's color processor converts to a platform
  // int. Channels are rounded; alpha stays fractional.
  override __getValue(): string {
    const r = Math.round(numericValue(this.r))
    const g = Math.round(numericValue(this.g))
    const b = Math.round(numericValue(this.b))
    const a = numericValue(this.a)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  setValue(value: RgbaValue | string | number): void {
    const rgba = typeof value === 'object' ? value : normalizeColor(value) ?? DEFAULT_COLOR
    this.r.setValue(rgba.r)
    this.g.setValue(rgba.g)
    this.b.setValue(rgba.b)
    this.a.setValue(rgba.a)
  }

  setOffset(offset: RgbaValue): void {
    this.r.setOffset(offset.r)
    this.g.setOffset(offset.g)
    this.b.setOffset(offset.b)
    this.a.setOffset(offset.a)
  }

  flattenOffset(): void {
    this.r.flattenOffset()
    this.g.flattenOffset()
    this.b.flattenOffset()
    this.a.flattenOffset()
  }

  extractOffset(): void {
    this.r.extractOffset()
    this.g.extractOffset()
    this.b.extractOffset()
    this.a.extractOffset()
  }

  stopAnimation(callback?: (value: string) => void): void {
    this.r.stopAnimation()
    this.g.stopAnimation()
    this.b.stopAnimation()
    this.a.stopAnimation()
    callback?.(this.__getValue())
  }

  override __attach(): void {
    this.r.__addChild(this)
    this.g.__addChild(this)
    this.b.__addChild(this)
    this.a.__addChild(this)
    super.__attach()
  }

  override __detach(): void {
    this.r.__removeChild(this)
    this.g.__removeChild(this)
    this.b.__removeChild(this)
    this.a.__removeChild(this)
    super.__detach()
  }

  override __makeNative(): void {
    this.r.__makeNative()
    this.g.__makeNative()
    this.b.__makeNative()
    this.a.__makeNative()
    super.__makeNative()
  }

  override __getNativeConfig(): NativeNodeConfig {
    return {
      type: 'color',
      r: this.r.__getNativeTag(),
      g: this.g.__getNativeTag(),
      b: this.b.__getNativeTag(),
      a: this.a.__getNativeTag(),
    }
  }
}

function numericValue(node: AnimatedValue): number {
  const value = node.__getValue()
  return typeof value === 'number' ? value : 0
}
