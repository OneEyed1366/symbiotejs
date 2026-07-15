// Shared deep-linking config: one ILinkingConfig instance used BOTH by the root wiring
// (App.vue's useLinkingIntegration, for real OS deep links) and by the DeepLinking demo screen
// (a direct resolveRouteFromUrl call against a typed-in URL) — a single source of truth so the
// two never drift into resolving the same URL differently.
//
// Prefix deliberately distinct from the React port's `symbiotecanary://` (and would-be
// `symbiotecanaryvuetsx://`/`symbiotecanaryangular://` twins) — each framework's canary is a
// separate installed app on a real device, so a shared URL scheme would route a deep link to
// whichever one the OS last resolved it to, defeating the whole "tell the canaries apart"
// point of running more than one side by side.

import type { ILinkingConfig } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from './routes';

export const APP_LINKING_CONFIG: ILinkingConfig = {
  prefixes: ['symbiotecanaryvuesfc://', 'https://canary.symbiote-native.dev'],
  config: {
    screens: {
      [ROUTE_NAME.Details]: 'details/:id',
      [ROUTE_NAME.HeaderOptions]: 'header-options',
      [ROUTE_NAME.TabsDemo]: 'tabs',
    },
  },
};

export const SAMPLE_DEEP_LINK_URL = 'symbiotecanaryvuesfc://details/42';
