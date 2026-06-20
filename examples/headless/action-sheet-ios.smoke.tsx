// Headless proof of the ActionSheetIOS imperative module. A fake ActionSheetManager
// native module (installed via the New-Architecture `__turboModuleProxy` global, the
// same global getNativeModule reads) records the options it receives and immediately
// invokes the callback with buttonIndex 1. We assert that (a) the native got the
// options pass-through, and (b) the callback delivered the chosen index back to JS.
// A failure here is in JS, not native — no simulator needed.

// ActionSheetIOS isn't on the barrel yet (the parent wires exports), so reach the
// source directly — the headless harness has no built dist.
import { ActionSheetIOS } from '../../packages/react/src/action-sheet-ios'

// ---- fake ActionSheetManager native module ------------------------------

interface CapturedOptions {
  options: string[]
  cancelButtonIndex?: number
}

let captured: CapturedOptions | null = null

const fakeActionSheetManager = {
  showActionSheetWithOptions(
    options: CapturedOptions,
    callback: (buttonIndex: number) => void,
  ): void {
    captured = options
    // Simulate the user tapping row index 1.
    callback(1)
  },
}

// Install the JSI proxy getNativeModule resolves against. Only 'ActionSheetManager'
// is faked; anything else returns null (the absent-module path).
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown =>
    name === 'ActionSheetManager' ? fakeActionSheetManager : null,
})

// ---- run ----------------------------------------------------------------

let chosen = -1

ActionSheetIOS.showActionSheetWithOptions(
  { options: ['A', 'B', 'Cancel'], cancelButtonIndex: 2 },
  (idx) => {
    chosen = idx
  },
)

// ---- assertions ---------------------------------------------------------

if (captured === null) {
  throw new Error('ActionSheetManager.showActionSheetWithOptions was never called')
}

// Options must pass straight through to native.
const opts = captured.options
if (opts.length !== 3 || opts[0] !== 'A' || opts[1] !== 'B' || opts[2] !== 'Cancel') {
  throw new Error(`options did not pass through: ${JSON.stringify(captured)}`)
}
if (captured.cancelButtonIndex !== 2) {
  throw new Error(`cancelButtonIndex did not pass through: ${JSON.stringify(captured)}`)
}

// The callback must deliver the chosen index back to JS.
if (chosen !== 1) {
  throw new Error(`callback did not deliver buttonIndex: expected 1, got ${chosen}`)
}

console.log('action-sheet-ios.smoke OK')
