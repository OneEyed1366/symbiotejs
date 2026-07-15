<!--
  Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
  tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
  tint/no-icon look side by side with the customized tabs. Each tab's content is its own SFC
  (TabHomeScreen.vue/TabSearchScreen.vue/TabProfileScreen.vue, siblings under ./screens) — the Vue
  SFC twin of react's per-file-multi-component TabsDemoScreen.tsx, one component per file being
  Vue SFC's own idiom. `<TabScreen>` (not the dotted `Tab.Screen`) is the same marker imported
  directly — @symbiote-native/navigation/vue exports it standalone (see stack.ts's Screen /
  index.ts), sidestepping a dotted-tag template reference the same way App.vue already aliases
  Animated.View/Animated.ScrollView to AnimatedView/AnimatedScrollView. Vue SFC twin of
  .examples/react/screens/TabsDemoScreen.tsx.
-->
<script setup lang="ts">
import { Tab, TabScreen } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import TabHomeScreen from './TabHomeScreen.vue';
import TabSearchScreen from './TabSearchScreen.vue';
import TabProfileScreen from './TabProfileScreen.vue';
</script>

<template>
  <Tab initial-route-name="Home">
    <TabScreen
      name="Home"
      :component="TabHomeScreen"
      :options="{ tabBarLabel: 'Home', tabBarIcon: '🏠', tabBarActiveTintColor: LINE_COLOR.structure }"
    />
    <TabScreen
      name="Search"
      :component="TabSearchScreen"
      :options="{ tabBarLabel: 'Search', tabBarIcon: '🔍', tabBarBadge: 3 }"
    />
    <TabScreen
      name="Profile"
      :component="TabProfileScreen"
      :options="{ tabBarLabel: 'Profile', tabBarIcon: '👤' }"
    />
  </Tab>
</template>
