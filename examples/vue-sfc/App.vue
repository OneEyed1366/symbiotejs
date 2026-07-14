<!--
  Symbiote canary app entry: composes the native stack navigator (@symbiote-native/navigation/vue,
  driven by react-native-screens' RNSScreen/RNSScreenStack native views) over the full demo screen
  surface. Menu is the initial route — a menu of buttons, one per navigator/feature
  @symbiote-native/navigation exports; Canary is the app's OWN former root content (every
  @symbiote-native/vue primitive), unchanged and reachable from the menu's first row — see
  ./screens/CanaryScreen.vue's header for the relocation note. Details has no menu row of its
  own — it's the DeepLinking demo's resolution target (symbiotecanaryvuesfc://details/:id),
  reached only through that tour stop. Vue SFC twin of .examples/react/App.tsx: `<Screen>` (not
  the dotted `Stack.Screen`) is the same marker every ./screens SFC imports standalone —
  @symbiote-native/navigation/vue exports it at the top level (screen.ts) precisely so templates
  never need a dotted tag reference, the same reason Animated.View/Animated.ScrollView get
  aliased inside CanaryScreen.vue.

  useLinkingIntegration here takes the Stack's OWN `Ref<INavigatorHandle | null>` directly (no
  React-style "LinkingRunner, mounted only once the handle is non-null" wrapper needed) — Vue's
  onMounted hooks fire bottom-up (children before parents), so by the time this composable's own
  onMounted runs, the template `ref="stackHandle"` binding below has already resolved Stack's
  expose()d handle. See packages/navigation/src/vue/linking.ts's header for the full contrast
  with React's hook-per-render shape.
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Screen, Stack, useLinkingIntegration } from '@symbiote-native/navigation/vue';
import type { INavigatorHandle, IScreenOptions } from '@symbiote-native/navigation/vue';
import { hide } from '@symbiote-native/splash-screen/vue';
import './App.css';

import MenuScreen from './screens/MenuScreen.vue';
import CanaryScreen from './screens/CanaryScreen.vue';
import DetailsScreen from './screens/DetailsScreen.vue';
import HeaderOptionsScreen from './screens/HeaderOptionsScreen.vue';
import { headerOptionsScreenOptions } from './screens/header-options-screen-options';
import SheetDemoScreen from './screens/SheetDemoScreen.vue';
import TabsDemoScreen from './screens/TabsDemoScreen.vue';
import DrawerDemoScreen from './screens/DrawerDemoScreen.vue';
import NestedNavigatorsScreen from './screens/NestedNavigatorsScreen.vue';
import HooksDemoScreen from './screens/HooksDemoScreen.vue';
import DeepLinkingScreen from './screens/DeepLinkingScreen.vue';
import StatePersistenceScreen from './screens/StatePersistenceScreen.vue';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';

// Registered below on <Screen :name="ROUTE_NAME.SheetDemo"> — a plain options object is enough
// here (unlike headerOptionsScreenOptions's resolver) since none of these fields need the live
// navigation handle.
const sheetDemoScreenOptions: IScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  // NOT translucent, unlike every other screen's headerStyle: formSheet has its own separate
  // header-height accounting in react-native-screens (RNSScreenContentWrapper's
  // headerHeightErrata walk). An opaque headerStyle still gets a dark, on-theme bar without
  // touching that formSheet sizing path.
  //
  // headerTranslucent was originally suspected as the cause of the sheet's content rendering
  // blank/translucent-with-nothing-on-top — but that same symptom persisted with headerTranslucent
  // left unset, which ruled it out. The real cause was stack.ts's RNSScreenContentWrapper style:
  // it hardcoded `{ flex: 1 }` for every presentation, but react-native-screens' own
  // ScreenStackItem.tsx never does that for formSheet (see resolveScreenContentWrapperStyle in
  // core/render-stack.ts) — `flex: 1` (`bottom: 0`) forces React to set a strict frame on every
  // native shadow-state update during a detent drag, which is the visible flicker PR #1870 fixed
  // by switching formSheet to `absoluteWithNoBottom` instead (sized bottom-up from content). The
  // screen wraps its content in a ScrollView specifically because of that: react-native-screens'
  // own native fix for "content should still fill a taller detent" only resizes a ScrollView
  // child directly (RNSScreenContentWrapper.mm's coerceChildScrollViewComponentSizeToSize),
  // bypassing Yoga/flex entirely — a plain View would stay sized to its own content and leave a
  // plain-background gap below it on the 60%/100% detents. The ScrollView must be the FIRST
  // direct child of RNSScreenContentWrapper for that native search to find it — an app-level
  // SafeAreaView in between hides the ScrollView from that search entirely, so SheetDemoScreen.vue
  // skips SafeAreaView on purpose, unlike every other demo screen.
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  stackPresentation: 'formSheet',
  sheetAllowedDetents: [0.3, 0.6, 1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
  sheetInitialDetentIndex: 0,
};

const stackHandle = ref<INavigatorHandle | null>(null);
useLinkingIntegration(APP_LINKING_CONFIG, stackHandle);

onMounted(() => hide());
</script>

<template>
  <Stack ref="stackHandle" :initial-route-name="ROUTE_NAME.Menu">
    <Screen
      :name="ROUTE_NAME.Menu"
      :component="MenuScreen"
      :options="{
        title: 'Navigation Demos',
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Canary"
      :component="CanaryScreen"
      :options="{
        title: 'Symbiote Canary',
        headerShown: true,
        headerTranslucent: true,
        headerTintColor: LINE_COLOR.primitives,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Details"
      :component="DetailsScreen"
      :options="{
        title: 'Navigation Demo',
        headerTranslucent: true,
        headerTintColor: LINE_COLOR.primitives,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
        stackAnimation: 'slide_from_right',
        transitionDuration: 300,
      }"
    />
    <Screen :name="ROUTE_NAME.HeaderOptions" :component="HeaderOptionsScreen" :options="headerOptionsScreenOptions" />
    <Screen :name="ROUTE_NAME.SheetDemo" :component="SheetDemoScreen" :options="sheetDemoScreenOptions" />
    <Screen
      :name="ROUTE_NAME.TabsDemo"
      :component="TabsDemoScreen"
      :options="{
        title: 'Tabs Demo',
        headerShown: true,
        headerTintColor: LINE_COLOR.structure,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.DrawerDemo"
      :component="DrawerDemoScreen"
      :options="{
        title: 'Drawer Demo',
        headerShown: true,
        headerTintColor: LINE_COLOR.structure,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.NestedNavigators"
      :component="NestedNavigatorsScreen"
      :options="{
        title: 'Nested Navigators',
        headerShown: true,
        headerTintColor: LINE_COLOR.structure,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.HooksDemo"
      :component="HooksDemoScreen"
      :options="{
        title: 'Hooks Demo',
        headerShown: true,
        headerTintColor: LINE_COLOR.introspection,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.DeepLinking"
      :component="DeepLinkingScreen"
      :options="{
        title: 'Deep Linking',
        headerShown: true,
        headerTintColor: LINE_COLOR.routing,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.StatePersistence"
      :component="StatePersistenceScreen"
      :options="{
        title: 'State Persistence',
        headerShown: true,
        headerTintColor: LINE_COLOR.routing,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
  </Stack>
</template>
