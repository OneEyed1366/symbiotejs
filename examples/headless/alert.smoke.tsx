// Headless proof of the Alert imperative module across BOTH native backends. Fake
// native modules (installed via the New-Architecture `__turboModuleProxy` global, the
// same global getNativeModule reads) stand in for the host:
//
//   iOS (default)  → fake AlertManager records the args and immediately invokes the
//                    native callback with the id of the SECOND button; we assert the
//                    args carry both buttons and the id->onPress dispatch fired the
//                    second button's onPress.
//   Android        → flip Platform.OS to 'android' (runtime defineProperty, restored
//                    after), fake DialogManagerAndroid with getConstants() + showAlert;
//                    we assert the config maps the buttons onto positive/negative/
//                    neutral and onAction(buttonClicked, buttonPositive) fires the
//                    positive button's onPress.
//
// A failure here is in JS, not native — no simulator needed.

import { Platform } from '@symbiote/shared'
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

// ---- fake DialogManagerAndroid native module ----------------------------
// getConstants() returns the button-key constants RN documents; showAlert records the
// config and immediately fires onAction with the POSITIVE button key (a tap on it).

interface DialogConfig {
  title: string
  message: string
  cancelable: boolean
  buttonPositive?: string
  buttonNegative?: string
  buttonNeutral?: string
}

const ANDROID_CONSTANTS = {
  buttonClicked: 'buttonClicked',
  dismissed: 'dismissed',
  buttonPositive: -1,
  buttonNegative: -2,
  buttonNeutral: -3,
}

let capturedConfig: DialogConfig | null = null

const fakeDialogManagerAndroid = {
  getConstants(): typeof ANDROID_CONSTANTS {
    return ANDROID_CONSTANTS
  },
  showAlert(
    config: DialogConfig,
    _onError: (error: string) => void,
    onAction: (action: string, buttonKey?: number) => void,
  ): void {
    capturedConfig = config
    // Simulate the user tapping the POSITIVE button. Native reports its key constant.
    onAction(ANDROID_CONSTANTS.buttonClicked, ANDROID_CONSTANTS.buttonPositive)
  },
}

// Install the JSI proxy getNativeModule resolves against. Both fakes are served by
// name; anything else returns null (the absent-module path).
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown => {
    if (name === 'AlertManager') return fakeAlertManager
    if (name === 'DialogManagerAndroid') return fakeDialogManagerAndroid
    return null
  },
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

// ---- Android branch -----------------------------------------------------
// Flip Platform.OS to 'android' so Alert.alert routes to DialogManagerAndroid. The
// last button maps to positive; onAction(buttonClicked, buttonPositive) must fire it.

const originalOS = Platform.OS
Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })

let androidPositivePressed = false
let androidNeutralPressed = false

try {
  Alert.alert('androidTitle', 'androidMsg', [
    { text: 'Neutral', onPress: () => { androidNeutralPressed = true } },
    { text: 'Cancel' },
    { text: 'OK', onPress: () => { androidPositivePressed = true } },
  ])

  if (capturedConfig === null) {
    throw new Error('DialogManagerAndroid.showAlert was never called')
  }
  if (capturedConfig.title !== 'androidTitle' || capturedConfig.message !== 'androidMsg') {
    throw new Error(`android config title/message wrong: ${JSON.stringify(capturedConfig)}`)
  }
  // last button -> positive, middle -> negative, first -> neutral.
  if (capturedConfig.buttonPositive !== 'OK') {
    throw new Error(`android buttonPositive should be 'OK', got ${JSON.stringify(capturedConfig.buttonPositive)}`)
  }
  if (capturedConfig.buttonNegative !== 'Cancel') {
    throw new Error(`android buttonNegative should be 'Cancel', got ${JSON.stringify(capturedConfig.buttonNegative)}`)
  }
  if (capturedConfig.buttonNeutral !== 'Neutral') {
    throw new Error(`android buttonNeutral should be 'Neutral', got ${JSON.stringify(capturedConfig.buttonNeutral)}`)
  }
  // onAction fired buttonPositive, so OK's onPress must have run — and only it.
  if (!androidPositivePressed) {
    throw new Error('android onAction dispatch failed: positive onPress did not fire on buttonPositive')
  }
  if (androidNeutralPressed) {
    throw new Error('android onAction mis-dispatched: neutral onPress fired on a buttonPositive action')
  }
} finally {
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true })
}

console.log('alert.smoke OK')
