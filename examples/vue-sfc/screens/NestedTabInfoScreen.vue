<!-- A second nested tab, proving the nested Tab bar switches focus normally. Vue SFC twin of NestedNavigatorsScreen.tsx's inline NestedTabInfoScreen. -->
<script setup lang="ts">
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];
</script>

<template>
  <SafeAreaView class="screen">
    <View class="section">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <Text class="section-label">Nested Tab · Info</Text>
      <Text class="info-text">A second tab, proving the nested Tab bar switches focus normally.</Text>
    </View>
  </SafeAreaView>
</template>
