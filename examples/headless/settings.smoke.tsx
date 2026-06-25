// Headless proof of the Settings module: the snapshot seeds from native
// `getConstants().settings`, `set` writes through to native `setValues` AND updates
// the snapshot, and a `watchKeys` watcher fires only when its key's value actually
// changes — never for an unrelated key.

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []

const fakeSettingsManager = {
  getConstants() {
    return { settings: { foo: 1 } }
  },
  setValues(values: Record<string, unknown>) {
    nativeCalls.push({ method: 'setValues', args: [values] })
  },
  deleteValues(keys: string[]) {
    nativeCalls.push({ method: 'deleteValues', args: [keys] })
  },
  addListener() {},
  removeListeners() {},
}

// Capture the device hub native would push `settingsUpdated` through, so the test
// can play "native" and emit an external edit.
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  nativeModuleProxy: { SettingsManager: fakeSettingsManager },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory()
  },
})

// Import AFTER faking the module so the snapshot seeds from the fake. The direct
// file path (not the barrel) keeps the smoke independent of barrel wiring.
const { Settings } = await import('../../adapters/react/src/settings')

// ---- snapshot seeds from native getConstants().settings --------------------

if (Settings.get('foo') !== 1) {
  throw new Error(`expected seeded foo === 1, got ${String(Settings.get('foo'))}`)
}

// ---- set writes through to native setValues AND updates the snapshot --------

Settings.set({ foo: 2 })

const setCalls = nativeCalls.filter((call) => call.method === 'setValues')
if (setCalls.length !== 1) {
  throw new Error(`set should call native setValues exactly once, got ${setCalls.length}`)
}
const setArg = setCalls[0].args[0]
if (typeof setArg !== 'object' || setArg === null || Reflect.get(setArg, 'foo') !== 2) {
  throw new Error(`setValues should receive {foo:2}, got ${JSON.stringify(setArg)}`)
}
if (Settings.get('foo') !== 2) {
  throw new Error(`expected updated foo === 2, got ${String(Settings.get('foo'))}`)
}

// ---- a watcher fires when its key changes, not for an unrelated key ---------

let fooFires = 0
Settings.watchKeys('foo', () => {
  fooFires += 1
})

Settings.set({ bar: 'x' })
if (fooFires !== 0) {
  throw new Error(`foo watcher must NOT fire for an unrelated key, fired ${fooFires}`)
}

Settings.set({ foo: 3 })
if (fooFires !== 1) {
  throw new Error(`foo watcher should fire once when foo changes, fired ${fooFires}`)
}
if (Settings.get('foo') !== 3) {
  throw new Error(`expected foo === 3 after change, got ${String(Settings.get('foo'))}`)
}

// Setting the SAME value again is not a change: the watcher stays quiet.
Settings.set({ foo: 3 })
if (fooFires !== 1) {
  throw new Error(`foo watcher must NOT fire when the value is unchanged, fired ${fooFires}`)
}

// ---- a native settingsUpdated event feeds the snapshot + fires watchers -----

if (deviceHub === undefined) {
  throw new Error('Settings must install the device hub so native edits flow in')
}
deviceHub.emit('settingsUpdated', { foo: 4 })
if (Settings.get('foo') !== 4) {
  throw new Error(`native settingsUpdated should update foo to 4, got ${String(Settings.get('foo'))}`)
}
if (fooFires !== 2) {
  throw new Error(`foo watcher should fire on a native change, fired ${fooFires}`)
}

console.log('settings.smoke OK')
