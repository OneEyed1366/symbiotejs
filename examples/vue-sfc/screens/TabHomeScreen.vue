<!-- Tabs demo · Home tab: custom tabBarIcon + tabBarActiveTintColor (registered on TabsDemoScreen.vue's <TabScreen>). Vue SFC twin of TabsDemoScreen.tsx's inline TabHomeScreen. -->
<script setup lang="ts">
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { useIsFocused } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const isFocused = useIsFocused();
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];
</script>

<template>
  <SafeAreaView class="screen">
    <View class="section">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: LINE_COLOR.structure }">
          <Text class="hero-badge-text">TB</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Tabs</Text>
          <Text class="hero-body"
            >A bottom-tabs navigator — icon, badge, and tint, each tab a real native
            view.</Text
          >
        </View>
      </View>
      <Text class="info-text">{{ `focused: ${isFocused}` }}</Text>
    </View>
  </SafeAreaView>
</template>
