// Linking: iOS build. The native module is `LinkingManager`
// (RN's TurboModuleRegistry.get('LinkingManager')); iOS has no `sendIntent`, so per
// RN's Linking.js it rejects 'Unsupported'. Everything else is the shared core. Metro
// picks this file on an iOS host; the base linking.ts re-exports it for web/headless.

import { createLinking } from './shared';

export type { IUrlEvent, IIntentExtra } from './shared';

export const Linking = createLinking({
  moduleName: 'LinkingManager',
  sendIntent: () => Promise.reject(new Error('Unsupported')),
});
