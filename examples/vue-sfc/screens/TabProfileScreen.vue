<!-- Tabs demo · Profile tab: stays plain, no icon/badge/tint override — shows the default tab look side by side with the customized Home/Search tabs. Vue SFC twin of TabsDemoScreen.tsx's inline TabProfileScreen. -->
<script setup lang="ts">
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { useIsFocused } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const isFocused = useIsFocused();
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];
</script>

<template>
  <SafeAreaView class="screen">
    <View class="section">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <Text class="section-label">Profile tab</Text>
      <Text class="info-text">{{ `focused: ${isFocused}` }}</Text>
    </View>
  </SafeAreaView>
</template>
