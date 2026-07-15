// Route-name constants shared between App.tsx's <Stack.Screen name="..."> registrations and
// every screen's navigation.push(...)/navigation.jumpTo(...) calls — a single source of truth so
// a typo can't silently create a dead route on one side only.

export const ROUTE_NAME = {
  Menu: 'Menu',
  Canary: 'Canary',
  Details: 'Details',
  HeaderOptions: 'HeaderOptions',
  SheetDemo: 'SheetDemo',
  TabsDemo: 'TabsDemo',
  DrawerDemo: 'DrawerDemo',
  NestedNavigators: 'NestedNavigators',
  HooksDemo: 'HooksDemo',
  DeepLinking: 'DeepLinking',
  StatePersistence: 'StatePersistence',
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
