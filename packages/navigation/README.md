# @symbiote-native/navigation

A native stack/tab/drawer navigator for [SymbioteNative](../../README.md), built directly on
[`react-native-screens`](https://github.com/software-mansion/react-native-screens)' native view
primitives (`RNSScreen`/`RNSScreenStack`/`RNSScreenStackHeaderConfig`/`RNSSearchBar`) — reachable
from **every** adapter: React, Vue, and Angular. Unlike the third-party-view wrappers
([`@symbiote-native/slider`](../slider), [`@symbiote-native/splash-screen`](../splash-screen)),
there is no upstream React component to route around here at all — `react-navigation`'s own
navigator UI is itself React-only (it calls hooks off the React dispatcher), so wrapping it was
never on the table. This package is a genuine new shared component instead: a
framework-agnostic route-stack reducer, `react-native-screens` prop folds, and native-leaf
resolvers, written once in `core/` and driven by a thin per-adapter lifecycle bridge — the same
logic/view/lifecycle split every other SymbioteNative component follows.

## Install

```bash
npm install @symbiote-native/navigation
```

Only this package — never `react-native-screens` directly. `@symbiote-native/navigation` depends
on it and ships as the sole autolinked native proxy (`react-native.config.cjs` +
`symbiote-navigation.podspec`), the same one-dependency packaging as `@symbiote-native/slider` and
`@symbiote-native/splash-screen`.

## Shape

```
src/
├── core/         framework-agnostic: the Stack route reducer (navigator-state) and Tab
│                 focused-index reducer (tab-router-state), react-native-screens prop folds
│                 (render-stack, screen-options), the drawer swipe/geometry math
│                 (drawer-options, drawer-router-state), linking-config's URL<->route matcher,
│                 state-persistence's serialize/deserialize, and the search-bar command builder
├── register.ts   side-effect import of react-native-screens' vendored codegen specs
│                 (codegen-specs/) — registers RNSScreen/RNSScreenStack/
│                 RNSScreenStackHeaderConfig/RNSSearchBar's ViewConfigs (never
│                 react-native-screens' own React components)
├── react/        @symbiote-native/navigation/react   — Stack/Tab/Drawer + hooks
├── vue/          @symbiote-native/navigation/vue     — Stack/Tab/Drawer + composables
└── angular/      @symbiote-native/navigation/angular — Stack/Tab/Drawer + directives + inject*
```

Each adapter entry imports `../register` first (so every native view's `ViewConfig` is registered
before a screen ever mounts), then exposes `Stack`, `Tab`, and `Drawer`. The router/reducer logic
and every `react-native-screens` prop fold are written once in `core/` and shared verbatim; each
adapter supplies only its own lifecycle (hooks / composables / `inject*` functions) and the
descriptor bridge.

## Use it

### Stack

The primary navigator — native, `react-native-screens`-backed push/pop/replace/reset over a
`RNSScreenStack`.

```tsx
// React — examples/react/App.tsx
import { useState } from 'react';
import { Stack } from '@symbiote-native/navigation/react';
import type { INavigatorHandle } from '@symbiote-native/navigation/react';

function App() {
  const [stackHandle, setStackHandle] = useState<INavigatorHandle | null>(null);

  return (
    <Stack ref={setStackHandle} initialRouteName="Menu">
      <Stack.Screen name="Menu" component={MenuScreen} options={{ title: 'Navigation Demos' }} />
      <Stack.Screen name="Details" component={DetailsScreen} options={{ title: 'Details' }} />
    </Stack>
  );
}
```

```vue
<!-- Vue — examples/vue-sfc/App.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { Screen, Stack } from '@symbiote-native/navigation/vue';
import type { INavigatorHandle } from '@symbiote-native/navigation/vue';

const stackHandle = ref<INavigatorHandle | null>(null);
</script>

<template>
  <Stack ref="stackHandle" initial-route-name="Menu">
    <Screen name="Menu" :component="MenuScreen" :options="{ title: 'Navigation Demos' }" />
    <Screen name="Details" :component="DetailsScreen" :options="{ title: 'Details' }" />
  </Stack>
</template>
```

```ts
// Angular — examples/angular/src/App.ts
import { Component, ViewChild } from '@angular/core';
import { Stack, ScreenDirective } from '@symbiote-native/navigation/angular';

@Component({
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Menu">
      <ng-template symbioteScreen name="Menu" [component]="menuScreen" [options]="menuOptions"></ng-template>
      <ng-template symbioteScreen name="Details" [component]="detailsScreen" [options]="detailsOptions"></ng-template>
    </Stack>
  `,
})
export class AppComponent {
  @ViewChild('nav') private readonly nav!: Stack;
  readonly menuScreen = MenuScreen;
  readonly menuOptions = { title: 'Navigation Demos' };
  readonly detailsScreen = DetailsScreen;
  readonly detailsOptions = { title: 'Details' };
}
```

`Stack` itself implements `INavigatorHandle` in Angular — `@ViewChild` gives you the handle
directly, no separate ref callback. In React/Vue, the ref only attaches during commit — code that
needs the handle (e.g. `useLinkingIntegration` below) must gate on it being non-null first.

### Tabs, Drawer, hooks, deep linking, and state persistence

`@symbiote-native/navigation` also ships a pure-JS bottom-tabs navigator (`Tab`/`Tab.Screen`), a
swipeable drawer navigator (`Drawer`/`Drawer.Screen`, built on `PanResponder`/`Animated` since this
codebase doesn't depend on `react-native-gesture-handler`/`react-native-reanimated` — see
[Known gaps](#known-gaps-drawer-parity) below), the full `useNavigation`/`useRoute`/
`useIsFocused`/`useFocusEffect`/`useNavigationState` hook family (narrowed per navigator as
`useStackNavigation`/`useTabNavigation`/`useDrawerNavigation`, with Vue composable and Angular
`inject*` twins of all of them), header/search-bar screen options (bar buttons, menus,
`formSheet`/modal presentation, `sheetAllowedDetents`), a `resolveRouteFromUrl`/
`useLinkingIntegration` deep-linking layer, and `serializeNavigatorState`/
`deserializeNavigatorState` for state persistence. See the docs-site package page
(`docs/packages/navigation`) for the full config surface and every adapter's exact syntax — or the
canary demo screens themselves (`examples/*/screens/{TabsDemoScreen,DrawerDemoScreen,
HeaderOptionsScreen,SheetDemoScreen,DeepLinkingScreen,StatePersistenceScreen}`), which the docs
page mirrors verbatim.

## Known gaps: drawer parity

The real `@react-navigation/drawer` is built on `react-native-gesture-handler` +
`react-native-reanimated`, neither of which this codebase depends on. `Drawer` reaches the same
swipe-to-open/close + `front`/`back`/`slide`/`permanent` behavior using only `PanResponder` +
`Animated` — sufficient for a solid drawer, but not byte-for-byte parity. Not ported:
`configureGestureHandler` (a raw gesture-handler escape hatch, no `PanResponder` equivalent),
gesture-handler's declarative simultaneous/failure gesture relationships (more prone to a nested
horizontal `ScrollView` hijacking the swipe), `useDrawerProgress` as a UI-thread `SharedValue`
(here `progress` is a JS-thread `Animated.Value`), and `hideStatusBarOnOpen`/`keyboardDismissMode`/
`statusBarAnimation`/`overlayStyle`. The core option surface (`drawerWidth`, `overlayColor`,
`swipeEnabled`, `swipeEdgeWidth`, `swipeMinDistance`, `swipeMinVelocity`) otherwise mirrors
`react-navigation`'s own defaults.

## Test it

Headless tests live next to each adapter entry and the shared core
(`src/{core,react,vue,angular}/**/*.test.{ts,tsx}`) and drive the same reducers/prop folds every
adapter shares, plus per-adapter component tests against a fake `nativeFabricUIManager` slot.
Native rendering (the real `RNSScreenStack` push/pop transitions, header/search-bar chrome,
`formSheet` detents) is verified on-device (see the parent [README](../../README.md) for the
project's testing model).
