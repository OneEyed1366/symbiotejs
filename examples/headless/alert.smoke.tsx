// Headless proof of the Alert imperative module. A fake AlertManager native module
// (installed via the New-Architecture `__turboModuleProxy` global, the same global
// getNativeModule reads) records the args it receives and immediately invokes the
// native callback with the id of the SECOND button. We assert that (a) the native
// got args carrying both buttons, and (b) the id->onPress dispatch fired the second
// button's onPress. A failure here is in JS, not native — no simulator needed.

// Alert isn't on the barrel yet (the parent wires exports), so reach the source
// directly — the headless harness has no built dist.
import { Alert } from '../../packages/react/src/alert'

// ---- fake AlertManager native module ------------------------------------

interface CapturedArgs {
  title: string
  message?: string
  buttons: Array<Record<number, string>>
  type?: string
}

let captured: CapturedArgs | null = null

const fakeAlertManager = {
  alertWithArgs(args: CapturedArgs, callback: (id: number, value: string) => void): void {
    captured = args
    // Simulate the user tapping the SECOND button (index 1). Native reports its id.
    callback(1, '')
  },
}

// Install the JSI proxy getNativeModule resolves against. Only 'AlertManager' is
// faked; anything else returns null (the absent-module path).
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown => (name === 'AlertManager' ? fakeAlertManager : null),
})

// ---- run ----------------------------------------------------------------

let okPressed = false

Alert.alert('t', 'm', [
  { text: 'Cancel' },
  {
    text: 'OK',
    onPress: () => {
      okPressed = true
    },
  },
])

// ---- assertions ---------------------------------------------------------

if (captured === null) {
  throw new Error('AlertManager.alertWithArgs was never called')
}

if (captured.title !== 't' || captured.message !== 'm') {
  throw new Error(`args title/message wrong: ${JSON.stringify(captured)}`)
}

// Both buttons must reach native as { [index]: label } entries.
if (captured.buttons.length !== 2) {
  throw new Error(`expected 2 buttons in args, got ${JSON.stringify(captured.buttons)}`)
}
if (captured.buttons[0][0] !== 'Cancel' || captured.buttons[1][1] !== 'OK') {
  throw new Error(`button labels/ids wrong: ${JSON.stringify(captured.buttons)}`)
}

// The id->onPress dispatch: native returned id=1, so the second button's onPress
// must have fired.
if (!okPressed) {
  throw new Error('id->onPress dispatch failed: OK button onPress did not fire on callback id=1')
}

console.log('alert.smoke OK')
