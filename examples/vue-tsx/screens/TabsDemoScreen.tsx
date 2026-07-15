import { defineComponent } from 'vue';
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { Tab, useIsFocused } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const tabsLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

const TabLineTag = defineComponent(
  () => () => (
    <View class={`line-tag line-tag-${tabsLineInfo.line}`}>
      <Text class="line-tag-text">{`${tabsLineInfo.code} · ${tabsLineInfo.label}`}</Text>
    </View>
  ),
  { name: 'TabLineTag' },
);

const TabHomeScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <TabLineTag />
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.structure }}>
              <Text class="hero-badge-text">TB</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Tabs</Text>
              <Text class="hero-body">
                A bottom-tabs navigator — icon, badge, and tint, each tab a real native view.
              </Text>
            </View>
          </View>
          <Text class="info-text">{`focused: ${isFocused.value}`}</Text>
        </View>
      </SafeAreaView>
    );
  },
  { name: 'TabHomeScreen' },
);

const TabSearchScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <TabLineTag />
          <Text class="section-label">Search tab</Text>
          <Text class="info-text">{`focused: ${isFocused.value}`}</Text>
        </View>
      </SafeAreaView>
    );
  },
  { name: 'TabSearchScreen' },
);

const TabProfileScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <TabLineTag />
          <Text class="section-label">Profile tab</Text>
          <Text class="info-text">{`focused: ${isFocused.value}`}</Text>
        </View>
      </SafeAreaView>
    );
  },
  { name: 'TabProfileScreen' },
);

/**
 * Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
 * tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
 * tint/no-icon look side by side with the customized tabs.
 */
export const TabsDemoScreen = defineComponent(
  () => () => (
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
  ),
  { name: 'TabsDemoScreen' },
);
