import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// The @symbiote-native/navigation demo suite groups its 9 tour screens into 5 thematic "lines" —
// which part of the package each screen exercises — carried through MenuScreen's row badges, each
// demo screen's own line tag, and (where the native header/tab bar already takes a tint color) the
// OS chrome itself. One color per line replaces the single flat accent every row/button used to
// share. Kept in sync by hand with App.css's `:root` `--line-*` tokens — CSS custom properties and
// this module are different runtimes with no shared import path.
export const NAV_LINE = {
  Primitives: 'primitives',
  Presentation: 'presentation',
  Structure: 'structure',
  Introspection: 'introspection',
  Routing: 'routing',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // React's own brand blue (react.dev's logo/accent blue) — CanaryScreen is the "every
  // @symbiote-native/react primitive" showcase, so its line wears React's actual color instead
  // of an arbitrary pick. Deliberately react.dev's more saturated #149eca, not the paler classic
  // #61dafb logo cyan — that shade sits too close to Presentation's #5ec8f2 below and the 5 lines
  // need to read apart from each other at a glance.
  [NAV_LINE.Primitives]: '#149eca',
  [NAV_LINE.Presentation]: '#5ec8f2',
  [NAV_LINE.Structure]: '#4fd1a5',
  [NAV_LINE.Introspection]: '#b18cf5',
  [NAV_LINE.Routing]: '#f2789a',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself. Deliberately excludes Details — it's a
// plain push-target off Canary, not one of the 9 tour stops.
export type ITourRouteName = Exclude<IRouteName, typeof ROUTE_NAME.Menu | typeof ROUTE_NAME.Details>;

export const ROUTE_LINE_INFO: Record<ITourRouteName, INavLineInfo> = {
  [ROUTE_NAME.Canary]: { line: NAV_LINE.Primitives, code: 'CN', label: 'PRIMITIVES LINE' },
  [ROUTE_NAME.HeaderOptions]: { line: NAV_LINE.Presentation, code: 'HD', label: 'PRESENTATION LINE' },
  [ROUTE_NAME.SheetDemo]: { line: NAV_LINE.Presentation, code: 'SH', label: 'PRESENTATION LINE' },
  [ROUTE_NAME.TabsDemo]: { line: NAV_LINE.Structure, code: 'TB', label: 'STRUCTURE LINE' },
  [ROUTE_NAME.DrawerDemo]: { line: NAV_LINE.Structure, code: 'DR', label: 'STRUCTURE LINE' },
  [ROUTE_NAME.NestedNavigators]: { line: NAV_LINE.Structure, code: 'NN', label: 'STRUCTURE LINE' },
  [ROUTE_NAME.HooksDemo]: { line: NAV_LINE.Introspection, code: 'HK', label: 'INTROSPECTION LINE' },
  [ROUTE_NAME.DeepLinking]: { line: NAV_LINE.Routing, code: 'DL', label: 'ROUTING LINE' },
  [ROUTE_NAME.StatePersistence]: { line: NAV_LINE.Routing, code: 'SP', label: 'ROUTING LINE' },
};
