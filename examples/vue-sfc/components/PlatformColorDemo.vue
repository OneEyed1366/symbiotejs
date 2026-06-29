<!--
  PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
  become iOS UIColor selectors, and the dynamic tuple flips with the system
  appearance. The opaque color objects flow through the same color seam as CSS
  strings (processColor), so no special handling reaches Fabric. Name resolution is
  device-only: a wrong name silently falls back, so this is verified on simulator.
-->
<script setup lang="ts">
import { View, Text, PlatformColor, DynamicColorIOS, useColorScheme, StyleSheet } from '@symbiote/vue'

const scheme = useColorScheme()

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12 },
  colorTile: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorTileBordered: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  boldLabel: { fontSize: 13, fontWeight: 'bold' },
})
</script>

<template>
  <View :style="styles.section">
    <Text :style="styles.sectionLabel">{{ `PlatformColor · semantic + DynamicColorIOS (${scheme ?? 'unknown'})` }}</Text>
    <View :style="styles.row">
      <View :style="[styles.colorTile, { backgroundColor: PlatformColor('systemBlue') }]">
        <Text :style="styles.tileLabel">systemBlue</Text>
      </View>
      <View :style="[styles.colorTileBordered, { backgroundColor: DynamicColorIOS({ light: '#dcf3e8', dark: '#2c3e50' }), borderColor: PlatformColor('separator') }]">
        <Text :style="[styles.boldLabel, { color: PlatformColor('label') }]">dynamic</Text>
      </View>
    </View>
  </View>
</template>
