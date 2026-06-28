// Settings module: reads/writes the app's persisted defaults (iOS NSUserDefaults
// via the native SettingsManager). A JS-side snapshot seeded from the native module
// constants answers `get`; `set` writes through to native and updates the snapshot;
// `watchKeys`/`clearWatch` are a pure-JS subscription registry that fires when a
// watched key's value changes. Native re-broadcasts external edits through the
// device event `settingsUpdated`, which feeds the same change->fire path. Mirrors
// RN's Libraries/Settings/Settings.ios.js, iOS surface only.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  type IEventEmitterModule,
} from '../native-events';
import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';

// The iOS native module name RN registers this under. NOTE: this is the name the
// iOS JS wrapper resolves via `TurboModuleRegistry.getEnforcing('SettingsManager')`.
// The spec filename is `INativeSettingsManager`. Per the symbiote invariant, a
// module name is only provable on a real host (a headless fake answers to any
// name); this iOS name is device-verify-pending.
// See .docs/native-module-platform-routing.md.
const SETTINGS_MODULE = 'SettingsManager';

// The device event native emits when the app's defaults change out from under JS
// (e.g. a Settings.bundle edit). Its payload is a record of changed key->value.
const SETTINGS_UPDATED_EVENT = 'settingsUpdated';

// watchIds are handed out as the registry index, so the first watcher is 0. A
// cleared slot keeps its index (the array never shrinks) so later ids stay stable.
const FIRST_WATCH_ID = 0;

// The iOS SettingsManager native module: constants carry the seeded snapshot,
// setValues persists, deleteValues removes. It also drives the device event, so it
// participates in the addListener/removeListeners observe-counter protocol.
interface INativeSettingsManager extends IEventEmitterModule {
  getConstants(): { settings: Record<string, unknown> };
  setValues(values: Record<string, unknown>): void;
  deleteValues(keys: string[]): void;
}

interface ISubscription {
  keys: string[];
  callback: (() => void) | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Lazily resolved so importing this module has no native side effect. `null` when
// the module isn't linked (headless): the snapshot then starts empty and `set`
// updates only JS state + fires watchers.
let settingsModule: INativeSettingsManager | null | undefined;

function getModule(): INativeSettingsManager | null {
  if (settingsModule === undefined) {
    settingsModule = getNativeModule<INativeSettingsManager>(SETTINGS_MODULE);
    dlog(`Settings: module ${settingsModule ? 'resolved' : 'NOT resolved (null)'}`);
  }
  return settingsModule;
}

// The JS-side mirror of native defaults: seeded once from the module constants,
// kept in sync by `set` and by the `settingsUpdated` device event.
let snapshot: Record<string, unknown> | undefined;

function getSnapshot(): Record<string, unknown> {
  if (snapshot === undefined) {
    const module = getModule();
    const constants = module?.getConstants().settings;
    snapshot = isRecord(constants) ? { ...constants } : {};
    dlog(`Settings: snapshot seeded with ${Object.keys(snapshot).length} key(s)`);
  }
  return snapshot;
}

const subscriptions: ISubscription[] = [];

// Fire every watcher whose key set covers `key`. Called only for keys that changed.
function fireWatchers(key: string): void {
  for (const sub of subscriptions) {
    if (sub.callback !== null && sub.keys.includes(key)) sub.callback();
  }
}

// Fold a batch of new values into the snapshot, firing watchers for each key whose
// value actually changed. Shared by `set` (JS-originated) and the device event
// (native-originated), matching RN's `_sendObservations`.
function applyChanges(values: Record<string, unknown>): void {
  const current = getSnapshot();
  for (const key of Object.keys(values)) {
    const next = values[key];
    const didChange = current[key] !== next;
    current[key] = next;
    if (didChange) fireWatchers(key);
  }
}

let emitter: NativeEventEmitter | undefined;

// Subscribe to native's `settingsUpdated` so external edits flow into the snapshot.
// WHY lazy + module-gated: importing this file must have no native side effect, and
// with no native module there is nothing native to observe, so a headless run that
// never installs the device hub doesn't crash. Idempotent.
function subscribeToNative(): void {
  if (emitter !== undefined) return;
  const module = getModule();
  if (module === null) return;
  installDeviceEventHub();
  emitter = new NativeEventEmitter(module);
  emitter.addListener(SETTINGS_UPDATED_EVENT, payload => {
    if (!isRecord(payload)) return;
    applyChanges(payload);
  });
}

class SettingsImpl {
  // Read the current value for `key` from the JS snapshot. `undefined` if unset.
  get(key: string): unknown {
    subscribeToNative();
    return getSnapshot()[key];
  }

  // Persist `settings` to native, update the snapshot, and fire watchers for the
  // keys that changed. Without a native module (headless) only JS state updates.
  set(settings: Record<string, unknown>): void {
    subscribeToNative();
    const module = getModule();
    if (module === null) {
      dlog('Settings.set -> no module (JS snapshot + watchers only)');
    } else {
      module.setValues(settings);
    }
    applyChanges(settings);
  }

  // Register a watcher for one or more keys. Returns a numeric watchId (the registry
  // index) to pass to `clearWatch`.
  watchKeys(keys: string | string[], callback: () => void): number {
    subscribeToNative();
    const watched = typeof keys === 'string' ? [keys] : keys;
    const watchId = subscriptions.length + FIRST_WATCH_ID;
    subscriptions.push({ keys: watched, callback });
    return watchId;
  }

  // Disarm the watcher with the given id. Its slot is emptied (kept, not removed) so
  // every other watchId stays valid.
  clearWatch(watchId: number): void {
    if (watchId >= FIRST_WATCH_ID && watchId < subscriptions.length) {
      subscriptions[watchId] = { keys: [], callback: null };
    }
  }
}

export const Settings = new SettingsImpl();
