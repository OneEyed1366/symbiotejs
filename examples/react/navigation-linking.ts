// Shared deep-linking config: one ILinkingConfig instance used BOTH by the root wiring
// (App.tsx's useLinkingIntegration, for real OS deep links) and by the DeepLinking demo screen
// (a direct resolveRouteFromUrl call against a typed-in URL) — a single source of truth so the
// two never drift into resolving the same URL differently.

import type { ILinkingConfig } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from './routes';

export const APP_LINKING_CONFIG: ILinkingConfig = {
  prefixes: ['symbiotecanary://', 'https://canary.symbiote-native.dev'],
  config: {
    screens: {
      [ROUTE_NAME.Details]: 'details/:id',
      [ROUTE_NAME.HeaderOptions]: 'header-options',
      [ROUTE_NAME.TabsDemo]: 'tabs',
    },
  },
};

export const SAMPLE_DEEP_LINK_URL = 'symbiotecanary://details/42';
