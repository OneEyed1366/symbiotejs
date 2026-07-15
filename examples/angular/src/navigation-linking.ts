// Shared deep-linking config: one ILinkingConfig instance used BOTH by the root wiring
// (App.ts's injectLinkingIntegration, for real OS deep links) and by the DeepLinking demo screen
// (a direct resolveRouteFromUrl call against a typed-in URL) - a single source of truth so the
// two never drift into resolving the same URL differently. The URL scheme is deliberately
// "symbiotecanaryangular://" (not the React canary's "symbiotecanary://") so the two apps' deep
// links stay distinguishable on a device that has both installed.

import type { ILinkingConfig } from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from './routes';

export const APP_LINKING_CONFIG: ILinkingConfig = {
  prefixes: ['symbiotecanaryangular://', 'https://canary-angular.symbiote-native.dev'],
  config: {
    screens: {
      [ROUTE_NAME.Details]: 'details/:id',
      [ROUTE_NAME.HeaderOptions]: 'header-options',
      [ROUTE_NAME.TabsDemo]: 'tabs',
    },
  },
};

export const SAMPLE_DEEP_LINK_URL = 'symbiotecanaryangular://details/42';
