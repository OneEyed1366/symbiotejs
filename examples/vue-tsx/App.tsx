/**
 * Symbiote canary app entry: composes the native stack navigator
 * (@symbiote-native/navigation/vue, driven by react-native-screens' RNSScreen/
 * RNSScreenStack native views) over the full demo screen surface. Menu is the initial
 * route — a menu of buttons, one per navigator/feature @symbiote-native/navigation exports;
 * Canary is unchanged and reachable from the menu's first row. Details has no menu row of its
 * own — it's the DeepLinking demo's resolution target (symbiotecanaryvuetsx://details/:id), reached
 * only through that tour stop. The actual canary surface (every @symbiote-native/vue
 * primitive) lives in ./screens/CanaryScreen — the FORMER content of this file, relocated
 * once the app grew a real Menu as its initial route.
 *
 * @format
 */

import './App.css';
import { defineComponent, onMounted, ref } from 'vue';
import { Stack, useLinkingIntegration } from '@symbiote-native/navigation/vue';
import type { INavigatorHandle } from '@symbiote-native/navigation/vue';
import { MenuScreen } from './screens/MenuScreen';
import { CanaryScreen } from './screens/CanaryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { HeaderOptionsScreen, headerOptionsScreenOptions } from './screens/HeaderOptionsScreen';
import { SheetDemoScreen, sheetDemoScreenOptions } from './screens/SheetDemoScreen';
import { TabsDemoScreen } from './screens/TabsDemoScreen';
import { DrawerDemoScreen } from './screens/DrawerDemoScreen';
import { NestedNavigatorsScreen } from './screens/NestedNavigatorsScreen';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { DeepLinkingScreen } from './screens/DeepLinkingScreen';
import { StatePersistenceScreen } from './screens/StatePersistenceScreen';
import { SensorsScreen } from './screens/SensorsScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import { hide } from '@symbiote-native/splash-screen/vue';

const App = defineComponent({
  name: 'App',
  setup() {
    const stackHandle = ref<INavigatorHandle | null>(null);

    onMounted(() => hide());

    // Vue's useLinkingIntegration takes the Stack's Ref ITSELF (not a resolved handle) and reads
    // `.value` lazily inside its own onMounted — Vue's onMounted callbacks fire bottom-up
    // (children mount, and their onMounted queues drain, before the parent's own onMounted
    // queue runs), so by the time this composable's onMounted fires, Stack below has already
    // mounted and populated `stackHandle.value` via its own expose(). No React-style
    // LinkingRunner child-mount workaround is needed here — see linking.ts's header comment for
    // the full React-vs-Vue timing rationale.
    useLinkingIntegration(APP_LINKING_CONFIG, stackHandle);

    return () => (
      <Stack ref={stackHandle} initialRouteName={ROUTE_NAME.Menu}>
        <Stack.Screen
          name={ROUTE_NAME.Menu}
          component={MenuScreen}
          options={{
            title: 'Navigation Demos',
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.Canary}
          component={CanaryScreen}
          options={{
            title: 'Symbiote Canary',
            headerShown: true,
            headerTranslucent: true,
            headerTintColor: LINE_COLOR.primitives,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.Details}
          component={DetailsScreen}
          options={{
            title: 'Navigation Demo',
            headerTranslucent: true,
            headerTintColor: LINE_COLOR.primitives,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
            // Edge-flicker investigation experiment: 'default' resolved to an ~480ms native
            // transition (measured via dlog). Explicit values here to check whether pinning
            // stackAnimation/transitionDuration changes the artifact's presence/character.
            stackAnimation: 'slide_from_right',
            transitionDuration: 300,
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.HeaderOptions}
          component={HeaderOptionsScreen}
          options={headerOptionsScreenOptions}
        />
        <Stack.Screen
          name={ROUTE_NAME.SheetDemo}
          component={SheetDemoScreen}
          options={sheetDemoScreenOptions}
        />
        <Stack.Screen
          name={ROUTE_NAME.TabsDemo}
          component={TabsDemoScreen}
          options={{
            title: 'Tabs Demo',
            headerShown: true,
            headerTintColor: LINE_COLOR.structure,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.DrawerDemo}
          component={DrawerDemoScreen}
          options={{
            title: 'Drawer Demo',
            headerShown: true,
            headerTintColor: LINE_COLOR.structure,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.NestedNavigators}
          component={NestedNavigatorsScreen}
          options={{
            title: 'Nested Navigators',
            headerShown: true,
            headerTintColor: LINE_COLOR.structure,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.HooksDemo}
          component={HooksDemoScreen}
          options={{
            title: 'Hooks Demo',
            headerShown: true,
            headerTintColor: LINE_COLOR.introspection,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.DeepLinking}
          component={DeepLinkingScreen}
          options={{
            title: 'Deep Linking',
            headerShown: true,
            headerTintColor: LINE_COLOR.routing,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.StatePersistence}
          component={StatePersistenceScreen}
          options={{
            title: 'State Persistence',
            headerShown: true,
            headerTintColor: LINE_COLOR.routing,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
        <Stack.Screen
          name={ROUTE_NAME.Sensors}
          component={SensorsScreen}
          options={{
            title: 'Sensors',
            headerShown: true,
            headerTintColor: LINE_COLOR.sensors,
            headerTranslucent: true,
            headerTitleColor: '#ffffff',
            headerStyle: { backgroundColor: '#0b1622' },
            headerUserInterfaceStyle: 'dark',
          }}
        />
      </Stack>
    );
  },
});

export default App;
