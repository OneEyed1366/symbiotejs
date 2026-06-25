// Linking — Android build. The native module is `IntentAndroid`
// (RN's TurboModuleRegistry.get('IntentAndroid'), spec NativeIntentAndroid): the same
// four URL methods as iOS plus `sendIntent(action, extras?)`. Everything else is the
// shared core. Metro picks this file on an Android host.
//
// device-verify-pending: the `IntentAndroid` name and routing are confirmed from RN
// source but not yet exercised on a real Android host — only a bridgeless resolution
// log there can prove the name. See .docs/native-module-platform-routing.md.

import { createLinking } from './linking-shared'

export type { UrlEvent, IntentExtra } from './linking-shared'

export const Linking = createLinking({
  moduleName: 'IntentAndroid',
  sendIntent: (module, action, extras) => {
    if (module === null || module.sendIntent === undefined) {
      return Promise.reject(new Error('Linking: IntentAndroid native module unavailable'))
    }
    return module.sendIntent(action, extras)
  },
})
