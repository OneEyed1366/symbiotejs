// Unit test for the zero-config host bootstrap (see bootstrap.ts's header for why this file
// stays outside @symbiote-native/components' main barrel). react-native itself is mocked: its
// real source is Flow syntax Vitest's Rolldown-based transform cannot parse.
import { describe, expect, it, vi } from 'vitest';

const setColorProcessor = vi.fn();
const setDeviceEventSource = vi.fn();
const setNativeViewConfigSource = vi.fn();
const setImageSourceResolver = vi.fn();

vi.mock('react-native', () => ({
  processColor: vi.fn(),
  DeviceEventEmitter: { addListener: vi.fn() },
  Image: { resolveAssetSource: vi.fn() },
}));
vi.mock('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry', () => ({
  get: vi.fn(),
}));
vi.mock('@symbiote-native/engine', () => ({
  setColorProcessor,
  setDeviceEventSource,
  setImageSourceResolver,
  setNativeViewConfigSource,
}));

const { bootstrapHost } = await import('./index');

describe('bootstrapHost', () => {
  it('forwards explicit overrides to every seam instead of touching react-native', () => {
    const colorProcessor = (): unknown => 'color';
    const imageSourceResolver = (): unknown => 'image';
    const deviceEventSource = { addListener: vi.fn() };
    const nativeViewConfigSource = (): undefined => undefined;

    bootstrapHost({
      colorProcessor,
      imageSourceResolver,
      deviceEventSource,
      nativeViewConfigSource,
      debug: true,
    });

    expect(setColorProcessor).toHaveBeenCalledWith(colorProcessor);
    expect(setImageSourceResolver).toHaveBeenCalledWith(imageSourceResolver);
    expect(setDeviceEventSource).toHaveBeenCalledWith(deviceEventSource);
    expect(setNativeViewConfigSource).toHaveBeenCalledWith(nativeViewConfigSource);
    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(true);
  });

  it('defaults debug from process.env.DEBUG when not overridden', () => {
    bootstrapHost({
      colorProcessor: () => undefined,
      imageSourceResolver: () => undefined,
      deviceEventSource: { addListener: vi.fn() },
      nativeViewConfigSource: () => undefined,
    });

    expect(globalThis.__SYMBIOTE_DEBUG__).toBe(process.env.DEBUG === '1');
  });
});
