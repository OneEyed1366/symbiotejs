// Image source resolution seam: require('./x.png') asset ids and {uri} sources are resolved by
// RN's own resolveAssetSource before reaching the shared render fn. The actual resolution is
// RN-platform-specific, so it is injected here rather than imported, mirroring platform-color.ts's
// processColor seam - this keeps @symbiote-native/components free of a react-native dependency (and
// the headless harness working). BOTH the pure renderImage view (@symbiote-native/components) and
// this package's own image-loader statics (resolveAssetSource) call resolveImageSource; neither
// reaches into the mutable resolver directly.

let sourceResolver: (source: unknown) => unknown = source => source;

export function setImageSourceResolver(resolve: (source: unknown) => unknown): void {
  sourceResolver = resolve;
}

// Public mirror of RN's Image.resolveAssetSource: run a source through the injected resolver.
// Headless (no resolver wired) it is the identity, so smokes see the input unchanged.
export function resolveImageSource(source: unknown): unknown {
  return sourceResolver(source);
}

// A source is either a structured object/array (remote or pre-resolved) or an opaque asset id
// (the number `require('./x.png')` returns) the resolver expands. Defined here rather than in
// @symbiote-native/components because image-loader's resolveAssetSource static needs the same
// shape and this package cannot depend on components (components depends on engine, never the
// reverse - see the components/engine dependency direction in package.json) - render-image.ts
// re-exports these verbatim for its own public props.
export type IImageSource = {
  uri?: string;
  scale?: number;
  width?: number;
  height?: number;
};

export type IImageSourceProp = IImageSource | IImageSource[] | number;
