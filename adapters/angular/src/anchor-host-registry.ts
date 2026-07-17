// Registry of composed-component selectors that must NOT paint a native view of their own.
//
// A dependency-free LEAF module (imports nothing from the adapter barrel `./index` or
// `./components`, both deeply require-cyclic). Both consumers reach it by RELATIVE path — the
// renderer imports `isAnchorHostComponent` from `../anchor-host-registry`, the barrel re-exports
// `registerComposedComponent` from `./anchor-host-registry` — so Metro keys it to ONE module
// instance / ONE Set. Do NOT give it a package `exports` subpath and inject THAT bare specifier
// into app code: a subpath resolves via a different path than the relative imports under pnpm
// symlinks, which splits the Set in two.
//
// Housing the registry here rather than inline in `renderer/index.ts` keeps it out of the require
// cycle (cheap insurance against a load-order strand). The bug that actually surfaced this,
// though, was STALE BUILD ARTIFACTS, not the cycle: `ngc -p` never deletes orphaned outputs, so
// after the renderer moved `renderer.ts` → `renderer/index.ts` the orphaned `build/angular/
// renderer.js` lingered and SHADOWED `build/angular/renderer/index.js` (a file beats a folder in
// Node/Metro resolution), giving the bundle a second, stale registry Set — fixed by cleaning
// `build/` before every ngc build (see each Angular package's `clean` script). Full record:
// angular-adapter §11c, symbiote-dev-examples §5e.

// Lowercased at construction — isAnchorHostComponent and registerComposedComponent both normalize
// to lowercase (Angular lowercases a dynamically-mounted component's selector at runtime, see
// angular-adapter §11a), so the literal entries below must match that or every capitalized one
// (all but the handful already written lowercase) silently never matches .has() and falls through
// to a real Fabric createNode — the exact "Unimplemented component" / extra-wrapper-node bug this
// Set exists to prevent.
const ANCHOR_HOST_COMPONENTS: Set<string> = new Set(
  [
    // Composed Angular components render their real Fabric descriptor tree from the template;
    // their Angular host element is only a framework bookkeeping node and must not paint. This
    // is NOT limited to adapter-authored components — ANY custom composed @Component used as a
    // plain <Tag> inside another template needs its selector listed here too, or Angular's
    // automatic host-element creation for it falls through to a raw Fabric createNode call with
    // an unrecognized view name, which paints RN's own "Unimplemented component: <Tag>" fallback
    // view instead (a real device-visible bug, not a silent no-op). This Set holds only
    // adapter/engine-owned selectors; app code and third-party packages self-register their own
    // composed components through registerComposedComponent instead of being hardcoded here.
    'ActivityIndicator',
    'Button',
    'FlatList',
    'AnimatedView',
    'symbiote-animated-view',
    'AnimatedText',
    'symbiote-animated-text',
    'AnimatedImage',
    'symbiote-animated-image',
    'AnimatedScrollView',
    'symbiote-animated-scroll-view',
    'symbiote-descriptor-outlet',
    'tunnel-out',
    'Image',
    'ImageBackground',
    'InputAccessoryView',
    'KeyboardAvoidingView',
    'Modal',
    'Pressable',
    'RefreshControl',
    'SafeAreaView',
    'ScrollView',
    'ScrollViewStickyHeader',
    'SectionList',
    'symbiote-sticky-header',
    'StatusBar',
    'Switch',
    'Text',
    'TextInput',
    'TouchableHighlight',
    'TouchableNativeFeedback',
    'TouchableOpacity',
    'TouchableWithoutFeedback',
    'VirtualizedList',
    'VirtualizedSectionList',
    'symbiote-pressable',
  ].map(selector => selector.toLowerCase()),
);

// A composed component's selector must be registered so createElement gives it a non-painting
// anchor host (see the Set comment above). Tests register their own child-component selectors
// through this at module load; app-authored composed components self-register the same way via
// the babel-register-composed plugin.
export function registerComposedComponent(selector: string): void {
  ANCHOR_HOST_COMPONENTS.add(selector.toLowerCase());
}

// True when `engineName` is a composed selector that must anchor-host (not paint). Case-
// insensitive — the Set is lowercased at construction, so callers pass the raw selector.
export function isAnchorHostComponent(engineName: string): boolean {
  return ANCHOR_HOST_COMPONENTS.has(engineName.toLowerCase());
}
