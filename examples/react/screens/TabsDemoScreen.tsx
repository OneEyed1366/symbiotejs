import { SafeAreaView, Text, View } from '@symbiote-native/react';
import { Tab, useIsFocused } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const tabsLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

function TabLineTag() {
  return (
    <View className={`line-tag line-tag-${tabsLineInfo.line}`}>
      <Text className="line-tag-text">{`${tabsLineInfo.code} · ${tabsLineInfo.label}`}</Text>
    </View>
  );
}

function TabHomeScreen() {
  const isFocused = useIsFocused();
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <TabLineTag />
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.structure }}>
            <Text className="hero-badge-text">TB</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Tabs</Text>
            <Text className="hero-body">
              A bottom-tabs navigator — icon, badge, and tint, each tab a real native view.
            </Text>
          </View>
        </View>
        <Text className="info-text">{`focused: ${isFocused}`}</Text>
      </View>
    </SafeAreaView>
  );
}

function TabSearchScreen() {
  const isFocused = useIsFocused();
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <TabLineTag />
        <Text className="section-label">Search tab</Text>
        <Text className="info-text">{`focused: ${isFocused}`}</Text>
      </View>
    </SafeAreaView>
  );
}

function TabProfileScreen() {
  const isFocused = useIsFocused();
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <TabLineTag />
        <Text className="section-label">Profile tab</Text>
        <Text className="info-text">{`focused: ${isFocused}`}</Text>
      </View>
    </SafeAreaView>
  );
}

/**
 * Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
 * tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
 * tint/no-icon look side by side with the customized tabs.
 */
export function TabsDemoScreen() {
  return (
    <Tab initialRouteName="Home">
      <Tab.Screen
        name="Home"
        component={TabHomeScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: '🏠', tabBarActiveTintColor: LINE_COLOR.structure }}
      />
      <Tab.Screen
        name="Search"
        component={TabSearchScreen}
        options={{ tabBarLabel: 'Search', tabBarIcon: '🔍', tabBarBadge: 3 }}
      />
      <Tab.Screen name="Profile" component={TabProfileScreen} options={{ tabBarLabel: 'Profile', tabBarIcon: '👤' }} />
    </Tab>
  );
}
