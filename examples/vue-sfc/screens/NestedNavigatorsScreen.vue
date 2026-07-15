<!--
  Nested navigators demo: THIS screen's content is a whole Tab navigator (not a plain View),
  proving a navigator can be nested inside another navigator's screen. NestedTabHomeScreen.vue's
  "Pop parent Stack" button proves useNavigation().value.getParent() reaches back through the
  Tab's own context to the enclosing root Stack and can drive it (pop this very screen off). Vue
  SFC twin of .examples/react/screens/NestedNavigatorsScreen.tsx.
-->
<script setup lang="ts">
import { Tab, TabScreen } from '@symbiote-native/navigation/vue';
import NestedTabHomeScreen from './NestedTabHomeScreen.vue';
import NestedTabInfoScreen from './NestedTabInfoScreen.vue';
</script>

<template>
  <Tab initial-route-name="NestedHome">
    <TabScreen name="NestedHome" :component="NestedTabHomeScreen" :options="{ tabBarLabel: 'Home' }" />
    <TabScreen name="NestedInfo" :component="NestedTabInfoScreen" :options="{ tabBarLabel: 'Info' }" />
  </Tab>
</template>
