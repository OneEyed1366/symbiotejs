<!--
  Drawer demo · Home: this screen is mounted under a Drawer, so useDrawerNavigation() hands back
  the Drawer-specific handle (openDrawer/closeDrawer/toggleDrawer/jumpTo) directly — no narrowing.
  Vue SFC twin of DrawerDemoScreen.tsx's inline DrawerHomeScreen.
-->
<script setup lang="ts">
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { useDrawerNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import ActionButton from '../components/ActionButton.vue';

const navigation = useDrawerNavigation();
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];
</script>

<template>
  <SafeAreaView class="screen">
    <View class="section">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: LINE_COLOR.structure }">
          <Text class="hero-badge-text">DR</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Drawer</Text>
          <Text class="hero-body"
            >A swipeable drawer sliding in from the right, driven by the navigator's own
            gesture handler.</Text
          >
        </View>
      </View>
      <Text class="info-text"
        >drawerPosition: right · drawerType: slide — swipe from the RIGHT edge, or use a
        button</Text
      >
      <ActionButton
        testID="drawer-open"
        title="Open drawer"
        :onPress="() => navigation.openDrawer()"
        :color="LINE_COLOR.structure"
      />
      <ActionButton
        testID="drawer-toggle"
        title="Toggle drawer"
        :onPress="() => navigation.toggleDrawer()"
        :color="LINE_COLOR.structure"
      />
    </View>
  </SafeAreaView>
</template>
