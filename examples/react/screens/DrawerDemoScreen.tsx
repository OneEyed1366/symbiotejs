import { Pressable, SafeAreaView, Text, View } from '@symbiote-native/react';
import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/react';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
} from '@symbiote-native/navigation/react';
import type { IDrawerRouterState } from '@symbiote-native/navigation';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

const drawerLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];

// Home/Settings are each Drawer's own top-level screen component; useDrawerNavigation() reads the
// enclosing Drawer's handle (already narrowed to IDrawerNavigatorHandle) straight from context.
function DrawerHomeScreen() {
  const navigation = useDrawerNavigation();
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <View className={`line-tag line-tag-${drawerLineInfo.line}`}>
          <Text className="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.structure }}>
            <Text className="hero-badge-text">DR</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Drawer</Text>
            <Text className="hero-body">
              A swipeable drawer sliding in from the right, driven by the navigator's own gesture
              handler.
            </Text>
          </View>
        </View>
        <Text className="info-text">
          drawerPosition: right · drawerType: slide — swipe from the RIGHT edge, or use a button
        </Text>
        <ActionButton
          testID="drawer-open"
          title="Open drawer"
          onPress={() => navigation.openDrawer()}
          color={LINE_COLOR.structure}
        />
        <ActionButton
          testID="drawer-toggle"
          title="Toggle drawer"
          onPress={() => navigation.toggleDrawer()}
          color={LINE_COLOR.structure}
        />
      </View>
    </SafeAreaView>
  );
}

function DrawerSettingsScreen() {
  const navigation = useDrawerNavigation();
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <View className={`line-tag line-tag-${drawerLineInfo.line}`}>
          <Text className="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</Text>
        </View>
        <Text className="section-label">Drawer demo · Settings</Text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          onPress={() => navigation.closeDrawer()}
          color={LINE_COLOR.structure}
        />
      </View>
    </SafeAreaView>
  );
}

type IDrawerContentProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

function renderDrawerContent({ state, descriptors, navigation }: IDrawerContentProps) {
  return (
    <SafeAreaView testID="drawer-panel" className="section-tight drawer-panel">
      <Text className="section-label">Menu</Text>
      {state.routes.map(route => (
        <Pressable
          key={route.key}
          testID={`drawer-menu-${route.name}`}
          className="menu-row"
          onPress={() => navigation.jumpTo(route.name)}
        >
          <Text className="menu-row-label">{descriptors[route.key]?.options.drawerLabel ?? route.name}</Text>
        </Pressable>
      ))}
    </SafeAreaView>
  );
}

/**
 * Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default
 * drawerPosition ('right') and drawerType ('slide') to prove those props actually flow through
 * to render-drawer.ts's geometry, plus imperative open/toggle/close buttons alongside the swipe
 * gesture. renderDrawerContent supplies the menu panel (Drawer ships no built-in one).
 */
export function DrawerDemoScreen() {
  return (
    <Drawer
      initialRouteName="Home"
      drawerPosition="right"
      drawerType="slide"
      renderDrawerContent={renderDrawerContent}
      drawerStyle={{ backgroundColor: '#13243a' }}
    >
      <Drawer.Screen name="Home" component={DrawerHomeScreen} options={{ title: 'Home', drawerLabel: 'Home' }} />
      <Drawer.Screen
        name="Settings"
        component={DrawerSettingsScreen}
        options={{ title: 'Settings', drawerLabel: 'Settings' }}
      />
    </Drawer>
  );
}
