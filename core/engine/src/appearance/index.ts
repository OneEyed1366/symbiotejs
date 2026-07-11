// Appearance module: reads/sets the device color scheme and reports changes.
// Native emits the device event `appearanceChanged` ({ colorScheme }) through the
// device hub; this subscribes via a NativeEventEmitter bound to the Appearance
// native module (which RN keys its appearance events off of) and re-broadcasts to
// JS listeners as a plain `{ colorScheme }` payload. Mirrors RN's
// Libraries/Utilities/Appearance.js, slimmed to the parts we need.

import { createDeviceEventModule } from '../native-modules';
import { type IEventEmitterModule, type IEventSubscription } from '../native-events';
import { dlog } from '../debug';

// The native module name RN registers the appearance module under, confirmed from
// its spec (specs_DEPRECATED/modules/INativeAppearance.js, `TurboModuleRegistry.get('Appearance')`).
const APPEARANCE_MODULE = 'Appearance';

// The device event native emits when the system color scheme changes. RN's
// INativeAppearance spec / Appearance.js.
const APPEARANCE_CHANGED_EVENT = 'appearanceChanged';

// The resolved color scheme. `setColorScheme` also accepts 'unspecified' (reset to
// the system value); a read only ever yields a concrete scheme or null.
export type IColorSchemeName = 'light' | 'dark';
export type IColorSchemePreference = IColorSchemeName | 'unspecified';

// The Appearance native module. `getColorScheme`/`setColorScheme` plus the
// observe-counters (so native starts/stops watching as JS subscribes).
interface INativeAppearance extends IEventEmitterModule {
  getColorScheme(): IColorSchemeName | null;
  setColorScheme(colorScheme: IColorSchemePreference): void;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

// The change-event payload native delivers.
interface IAppearancePreferences {
  colorScheme: IColorSchemeName | null;
}

function isAppearancePreferences(value: unknown): value is IAppearancePreferences {
  return typeof value === 'object' && value !== null && 'colorScheme' in value;
}

// Cached scheme, kept fresh by the change listener; mirrors RN's `state.appearance`.
let cachedScheme: IColorSchemeName | null | undefined;

// The self-subscription policy that diverges from a plain lazy-resolve+emitter:
// Appearance keeps `cachedScheme` fresh forever via a permanent change listener, so a
// later getColorScheme() after a system change reads the new value even with nobody
// else listening. RN does the same.
const deviceEventModule = createDeviceEventModule<INativeAppearance>({
  moduleName: APPEARANCE_MODULE,
  moduleLogPrefix: 'Appearance: module',
  onEmitterCreated: emitter => {
    emitter.addListener(APPEARANCE_CHANGED_EVENT, payload => {
      if (!isAppearancePreferences(payload)) return;
      dlog(`Appearance: ${APPEARANCE_CHANGED_EVENT} -> ${String(payload.colorScheme)}`);
      cachedScheme = payload.colorScheme;
    });
  },
});

function getModule(): INativeAppearance | null {
  return deviceEventModule.getModule();
}

function getEmitter() {
  return deviceEventModule.getEmitter();
}

export const Appearance = {
  // The current color scheme, or null when no module is linked / the device is in
  // 'unspecified'. Never throws; a missing module reads as null.
  getColorScheme(): IColorSchemeName | null {
    const module = getModule();
    if (module === null) return null;
    // Ensure the change listener is wired so the cache stays fresh after this read.
    getEmitter();
    if (cachedScheme === undefined) cachedScheme = module.getColorScheme();
    return cachedScheme;
  },

  // Override the color scheme (or 'unspecified' to follow the system). No-op when
  // the module isn't linked.
  setColorScheme(colorScheme: IColorSchemePreference): void {
    const module = getModule();
    if (module === null) {
      dlog('Appearance.setColorScheme -> no module (no-op)');
      return;
    }
    module.setColorScheme(colorScheme);
    cachedScheme = colorScheme === 'unspecified' ? (module.getColorScheme() ?? null) : colorScheme;
  },

  // Subscribe to color-scheme changes. The listener receives `{ colorScheme }`.
  addChangeListener(listener: (preferences: IAppearancePreferences) => void): IEventSubscription {
    dlog('Appearance.addChangeListener');
    return getEmitter().addListener(APPEARANCE_CHANGED_EVENT, payload => {
      if (!isAppearancePreferences(payload)) return;
      listener({ colorScheme: payload.colorScheme });
    });
  },
};
