// Zero-config host bootstrap for @symbiote-native/components' four RN-backed seams
// (colorProcessor, imageSourceResolver, deviceEventSource, nativeViewConfigSource), wired from
// real react-native in one call - collapses what every canary example currently hand-wires at
// startup. Lives OUTSIDE the package's main barrel (see package.json's separate "./bootstrap"
// export): react-native's own source is Flow syntax Vitest's transform can't parse, so anything
// importing it directly must stay unreachable from the tested main index.ts.

import { processColor, DeviceEventEmitter, Image, type ImageSourcePropType } from 'react-native';
import {
  setColorProcessor,
  setDeviceEventSource,
  setImageSourceResolver,
  setNativeViewConfigSource,
  type IColorValue,
  type IDeviceEventSource,
  type INativeViewConfig,
  type INativeViewConfigSource,
} from '@symbiote-native/engine';
// @ts-expect-error react-native ships no types for this internal path (plain .js) - the
// try/catch below is what actually proves the shape, not TS.
import * as ReactNativeViewConfigRegistry from 'react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry';

export type IBootstrapHostOptions = {
  colorProcessor?: (value: IColorValue) => unknown;
  imageSourceResolver?: (source: unknown) => unknown;
  deviceEventSource?: IDeviceEventSource;
  nativeViewConfigSource?: INativeViewConfigSource;
  debug?: boolean;
};

// Third-party Fabric views derive their events + prop processors from RN's own ViewConfig
// registry; `get` throws for an unregistered name, so undefined is the right answer for
// anything the registry doesn't know (our built-ins never reach here).
function defaultNativeViewConfigSource(name: string): INativeViewConfig | undefined {
  try {
    return ReactNativeViewConfigRegistry.get(name);
  } catch {
    return undefined;
  }
}

// require('./x.png') asset ids and {uri} sources are resolved by RN's own resolver before they
// reach the shared render fns. `source` is untyped at the setImageSourceResolver seam by design
// (any component's resolved shape flows through it) - this is the I/O edge where it crosses
// into RN's own typed Image API.
function defaultImageSourceResolver(source: unknown): unknown {
  return Image.resolveAssetSource(source as ImageSourcePropType);
}

// IColorValue is our own structural mirror of the runtime shapes RN's processColor accepts
// (CSS string / PlatformColor / DynamicColorIOS); RN's own ColorValue type is opaque, not
// structurally identical, so this is the I/O edge between the two color representations.
function defaultColorProcessor(value: IColorValue): unknown {
  return processColor(value as Parameters<typeof processColor>[0]);
}

export function bootstrapHost(options: IBootstrapHostOptions = {}): void {
  globalThis.__SYMBIOTE_DEBUG__ = options.debug ?? process.env.DEBUG === '1';
  setColorProcessor(options.colorProcessor ?? defaultColorProcessor);
  setImageSourceResolver(options.imageSourceResolver ?? defaultImageSourceResolver);
  setDeviceEventSource(options.deviceEventSource ?? DeviceEventEmitter);
  setNativeViewConfigSource(options.nativeViewConfigSource ?? defaultNativeViewConfigSource);
}
