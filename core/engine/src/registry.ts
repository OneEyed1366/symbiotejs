// Runtime metadata for native Fabric views, DERIVED BY DEFAULT. Any RN library
// already ships its own ViewConfig: codegen registers it into RN's
// ReactNativeViewConfigRegistry the moment the library's native-component module is
// imported. That config carries everything the shared engine can't infer: which
// events the view emits (bubblingEventTypes / directEventTypes) and how to process
// its props (validAttributes[*].process, e.g. processColor). So we DON'T transcribe
// any of it, and we don't mark anything "third-party": there is no
// per-package registration to maintain. The engine reads the config for ANY
// component on first use. Install a community view library, render it, done.
//
// shared must stay react-native-free (the headless harness runs in plain Node), so
// the ViewConfig lookup is INJECTED, exactly like the color processor: the adapter
// wires `setNativeViewConfigSource(ReactNativeViewConfigRegistry.get)` on a real
// host (on a real host that one source covers BOTH RN core and every library).
//
// The ONLY explicit list is OUR OWN built-in primitives (BUILTIN_COMPONENTS): a
// finite set we own, which keep their hand-tuned tables (view-config events, commit
// COLOR_PROPS) and are never read from the source, so they can't drift. Everything
// NOT in that set derives. The list never grows with the community; it grows only
// when we add a core primitive of our own.

export type IPropProcessor = (value: unknown) => unknown;

// A native event the component emits. `raw` is the Fabric topLevelType
// (`topRNCSliderSlidingComplete`); `listener` is the name our nodes register the
// handler under, from the `onX`-prop split (`onRNCSliderSlidingComplete` ->
// `rNCSliderSlidingComplete`). `direct: true` marks a non-bubbling event.
export interface INativeEventBinding {
  raw: string;
  listener: string;
  direct?: boolean;
}

// Manual override, an ESCAPE HATCH only, for a view with no codegen ViewConfig
// (an old-arch lib), or to patch a derived one. The common path needs none of this:
// a view's config is derived from the injected source automatically.
export interface IComponentRegistration {
  events?: readonly INativeEventBinding[];
  processors?: Readonly<Record<string, IPropProcessor>>;
}

// The slice of RN's ViewConfig we read. Structural and minimal: we never import
// react-native here, the adapter hands us whatever ReactNativeViewConfigRegistry
// returns and we touch only these fields.
interface IPhasedRegistrationNames {
  bubbled?: string;
}
interface IBubblingEventType {
  phasedRegistrationNames?: IPhasedRegistrationNames;
}
interface IDirectEventType {
  registrationName?: string;
}
export interface INativeViewConfig {
  bubblingEventTypes?: Record<string, IBubblingEventType | null | undefined>;
  directEventTypes?: Record<string, IDirectEventType | null | undefined>;
  validAttributes?: Record<string, unknown>;
}
export type INativeViewConfigSource = (name: string) => INativeViewConfig | undefined;

interface IResolved {
  listeners: Set<string>;
  byRaw: Map<string, INativeEventBinding>;
  processors: Map<string, IPropProcessor>;
}

const EMPTY: IResolved = { listeners: new Set(), byRaw: new Map(), processors: new Map() };

// OUR own primitives: the finite set shared hand-tunes (view-config events,
// commit COLOR_PROPS). The source is never consulted for these, so they can't
// drift. Everything else derives. This list grows only when WE add a core
// primitive, never for a community package.
const BUILTIN_COMPONENTS = new Set([
  'RCTView',
  'RCTText',
  'RCTRawText',
  'RCTVirtualText',
  'RCTImageView',
  'RCTScrollView',
  'RCTScrollContentView',
  'RCTSinglelineTextInputView',
  'RCTMultilineTextInputView',
  'Switch',
  'ActivityIndicatorView',
  'SafeAreaView',
  'ModalHostView',
  'PullToRefreshView',
  'RCTInputAccessoryView',
]) satisfies ReadonlySet<string>;

// Manual overrides per component (usually none): the escape hatch.
const overrides = new Map<string, IComponentRegistration[]>();
const resolvedCache = new Map<string, IResolved>();

let viewConfigSource: INativeViewConfigSource | undefined;

// Wired once by the adapter on a real host: `name => ReactNativeViewConfigRegistry.get(name)`.
export function setNativeViewConfigSource(source: INativeViewConfigSource): void {
  viewConfigSource = source;
  resolvedCache.clear();
}

// Escape hatch: override a derived config, or supply one for a view with no codegen
// ViewConfig. NOT needed on the common path; views derive from the source.
export function registerComponent(name: string, registration: IComponentRegistration = {}): void {
  const list = overrides.get(name);
  if (list === undefined) overrides.set(name, [registration]);
  else list.push(registration);
  resolvedCache.delete(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// onChange -> change (mirrors node.ts listenerName; the split of the handler prop).
function splitListener(handlerProp: string): string {
  return handlerProp.charAt(2).toLowerCase() + handlerProp.slice(3);
}

function addEvent(into: IResolved, binding: INativeEventBinding): void {
  into.listeners.add(binding.listener);
  into.byRaw.set(binding.raw, binding);
}

function deriveFromConfig(config: INativeViewConfig, into: IResolved): void {
  const { bubblingEventTypes, directEventTypes, validAttributes } = config;
  if (bubblingEventTypes) {
    for (const raw in bubblingEventTypes) {
      const bubbled = bubblingEventTypes[raw]?.phasedRegistrationNames?.bubbled;
      if (typeof bubbled === 'string') addEvent(into, { raw, listener: splitListener(bubbled) });
    }
  }
  if (directEventTypes) {
    for (const raw in directEventTypes) {
      const registrationName = directEventTypes[raw]?.registrationName;
      if (typeof registrationName === 'string') {
        addEvent(into, { raw, listener: splitListener(registrationName), direct: true });
      }
    }
  }
  if (validAttributes) {
    for (const key in validAttributes) {
      const attribute = validAttributes[key];
      if (isRecord(attribute)) {
        const process = attribute.process;
        // The codegen config already carries the right processor (processColor, …);
        // wrap it so the typed Function becomes a PropProcessor without a cast.
        if (typeof process === 'function') into.processors.set(key, value => process(value));
      }
    }
  }
}

function applyRegistration(registration: IComponentRegistration, into: IResolved): void {
  if (registration.events) for (const binding of registration.events) addEvent(into, binding);
  if (registration.processors) {
    for (const key of Object.keys(registration.processors)) {
      into.processors.set(key, registration.processors[key]);
    }
  }
}

// Resolve a component's metadata. OUR built-ins short-circuit to EMPTY so the
// source is never read for them (their hand-tuned tables stand). Everything else
// derives from the injected source, then any manual override wins on top.
function resolve(name: string): IResolved {
  if (BUILTIN_COMPONENTS.has(name)) return EMPTY;
  let resolved = resolvedCache.get(name);
  if (resolved !== undefined) return resolved;
  resolved = { listeners: new Set(), byRaw: new Map(), processors: new Map() };
  const config = viewConfigSource?.(name);
  if (config) deriveFromConfig(config, resolved);
  const registrations = overrides.get(name);
  if (registrations)
    for (const registration of registrations) applyRegistration(registration, resolved);
  resolvedCache.set(name, resolved);
  return resolved;
}

// True when `listener` is an event the (third-party) component emits.
export function isRegisteredEvent(component: string, listener: string): boolean {
  return resolve(component).listeners.has(listener);
}

// The binding for a raw Fabric event on this component, for incoming dispatch.
export function registeredNativeEvent(
  component: string,
  raw: string,
): INativeEventBinding | undefined {
  return resolve(component).byRaw.get(raw);
}

// The processor for a prop of this component (e.g. processColor for a tint), or
// undefined to leave the value untouched.
export function registeredProcessor(component: string, key: string): IPropProcessor | undefined {
  return resolve(component).processors.get(key);
}
