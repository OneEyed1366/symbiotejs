import { defineComponent } from 'vue';
import { Pressable, SafeAreaView, Text, View } from '@symbiote-native/vue';
import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/vue';
import type { IDrawerContentSlotProps } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

const drawerLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];

// Home/Settings are each mounted under a Drawer, so useDrawerNavigation() hands back the
// Drawer-specific handle (openDrawer/toggleDrawer/closeDrawer/jumpTo) directly — no narrowing.
const DrawerHomeScreen = defineComponent(
  () => {
    const navigation = useDrawerNavigation();
    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <View class={`line-tag line-tag-${drawerLineInfo.line}`}>
            <Text class="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.structure }}>
              <Text class="hero-badge-text">DR</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Drawer</Text>
              <Text class="hero-body">
                A swipeable drawer sliding in from the right, driven by the navigator's own gesture
                handler.
              </Text>
            </View>
          </View>
          <Text class="info-text">
            drawerPosition: right · drawerType: slide — swipe from the RIGHT edge, or use a button
          </Text>
          <ActionButton
            testID="drawer-open"
            title="Open drawer"
            onPress={() => navigation.value.openDrawer()}
            color={LINE_COLOR.structure}
          />
          <ActionButton
            testID="drawer-toggle"
            title="Toggle drawer"
            onPress={() => navigation.value.toggleDrawer()}
            color={LINE_COLOR.structure}
          />
        </View>
      </SafeAreaView>
    );
  },
  { name: 'DrawerHomeScreen' },
);

const DrawerSettingsScreen = defineComponent(
  () => {
    const navigation = useDrawerNavigation();
    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <View class={`line-tag line-tag-${drawerLineInfo.line}`}>
            <Text class="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</Text>
          </View>
          <Text class="section-label">Drawer demo · Settings</Text>
          <ActionButton
            testID="drawer-close-from-settings"
            title="Close drawer"
            onPress={() => navigation.value.closeDrawer()}
            color={LINE_COLOR.structure}
          />
        </View>
      </SafeAreaView>
    );
  },
  { name: 'DrawerSettingsScreen' },
);

function renderDrawerContent({ state, descriptors, navigation }: IDrawerContentSlotProps) {
  return (
    <SafeAreaView testID="drawer-panel" class="section-tight drawer-panel">
      <Text class="section-label">Menu</Text>
      {state.routes.map(route => (
        <Pressable
          key={route.key}
          testID={`drawer-menu-${route.name}`}
          class="menu-row"
          onPress={() => navigation.jumpTo(route.name)}
        >
          <Text class="menu-row-label">{descriptors[route.key]?.options.drawerLabel ?? route.name}</Text>
        </Pressable>
      ))}
    </SafeAreaView>
  );
}

/**
 * Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default
 * drawerPosition ('right') and drawerType ('slide') to prove those props actually flow through
 * to render-drawer.ts's geometry, plus imperative open/toggle/close buttons alongside the swipe
 * gesture. The `drawerContent` scoped slot supplies the menu panel (Drawer ships no built-in
 * one) — Vue's twin of React's renderDrawerContent render PROP.
 */
export const DrawerDemoScreen = defineComponent(
  () => () => (
    <Drawer
      initialRouteName="Home"
      drawerPosition="right"
      drawerType="slide"
      drawerStyle={{ backgroundColor: '#13243a' }}
    >
      {{
        default: () => [
          <Drawer.Screen name="Home" component={DrawerHomeScreen} options={{ title: 'Home', drawerLabel: 'Home' }} />,
          <Drawer.Screen
            name="Settings"
            component={DrawerSettingsScreen}
            options={{ title: 'Settings', drawerLabel: 'Settings' }}
          />,
        ],
        drawerContent: renderDrawerContent,
      }}
    </Drawer>
  ),
  { name: 'DrawerDemoScreen' },
);
