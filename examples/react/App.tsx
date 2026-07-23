/**
 * Symbiote canary app entry: composes the native stack navigator
 * (@symbiote-native/navigation/react, driven by react-native-screens' RNSScreen/
 * RNSScreenStack native views) over the full demo screen surface. Menu is the initial
 * route — a menu of buttons, one per navigator/feature @symbiote-native/navigation exports;
 * Canary is unchanged and reachable from the menu's first row. Details has no menu row of its
 * own — it's the DeepLinking demo's resolution target (symbiotecanary://details/:id), reached
 * only through that tour stop. The actual canary surface (every @symbiote-native/react
 * primitive) lives in ./screens/CanaryScreen; the demo sections it renders live under
 * ./components.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import {
  Stack,
  useLinkingIntegration,
} from '@symbiote-native/navigation/react';
import type {
  ILinkingConfig,
  INavigatorHandle,
} from '@symbiote-native/navigation/react';
import { MenuScreen } from './screens/MenuScreen';
import { CanaryScreen } from './screens/CanaryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import {
  HeaderOptionsScreen,
  headerOptionsScreenOptions,
} from './screens/HeaderOptionsScreen';
import {
  SheetDemoScreen,
  sheetDemoScreenOptions,
} from './screens/SheetDemoScreen';
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
import { hide } from '@symbiote-native/splash-screen/react';
import './App.css';

// useLinkingIntegration needs a REAL (non-null) INavigatorHandle, but a plain ref only gets
// attached during commit — reading stackRef.current straight from App()'s render body would
// still be null on the very first pass. Mounting this as a separate child (only once `handle` is
// non-null) sidesteps that: the `ref={setStackHandle}` callback fires during commit, scheduling
// the re-render that mounts LinkingRunner with the now-real handle.
function LinkingRunner({
  handle,
  config,
}: {
  handle: INavigatorHandle;
  config: ILinkingConfig;
}): null {
  useLinkingIntegration(config, handle);
  return null;
}

function App() {
  const [stackHandle, setStackHandle] = useState<INavigatorHandle | null>(null);

  useEffect(() => {
    hide();
  }, []);

  return (
    <>
      <Stack ref={setStackHandle} initialRouteName={ROUTE_NAME.Menu}>
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
      {stackHandle !== null && (
        <LinkingRunner handle={stackHandle} config={APP_LINKING_CONFIG} />
      )}
    </>
  );
}

export default App;
