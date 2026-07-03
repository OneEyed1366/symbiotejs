<!--
  PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
  become iOS UIColor selectors, and the dynamic tuple flips with the system
  appearance. The opaque color objects flow through the same color seam as CSS
  strings (processColor), so no special handling reaches Fabric. Name resolution is
  device-only: a wrong name silently falls back, so this is verified on simulator.
-->
<script setup lang="ts">
import { View, Text, PlatformColor, DynamicColorIOS, useColorScheme } from '@symbiotejs/vue'

const scheme = useColorScheme()
</script>

<template>
  <View class="section">
    <Text class="section-label">{{ `PlatformColor · semantic + DynamicColorIOS (${scheme ?? 'unknown'})` }}</Text>
    <View class="row">
      <View testID="platform-color-tile" class="color-tile" :style="{ backgroundColor: PlatformColor('systemBlue') }">
        <Text class="tile-label">systemBlue</Text>
      </View>
      <View testID="dynamic-color-tile" class="color-tile-bordered" :style="{ backgroundColor: DynamicColorIOS({ light: '#dcf3e8', dark: '#2c3e50' }), borderColor: PlatformColor('separator') }">
        <Text class="bold-label" :style="{ color: PlatformColor('label') }">dynamic</Text>
      </View>
    </View>
  </View>
</template>

<style scoped>
.section {
  gap: 12px;
}
.section-label {
  color: #3b5266;
  font-size: 13px;
}
.row {
  flex-direction: row;
  gap: 12px;
}
/* backgroundColor stays dynamic (PlatformColor is a runtime-resolved opaque color object) */
.color-tile {
  flex: 1;
  height: 56px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
}
/* backgroundColor / borderColor stay dynamic — DynamicColorIOS / PlatformColor */
.color-tile-bordered {
  flex: 1;
  height: 56px;
  border-radius: 12px;
  border-width: 1px;
  align-items: center;
  justify-content: center;
}
.tile-label {
  color: #ffffff;
  font-size: 13px;
  font-weight: bold;
}
/* color stays dynamic (PlatformColor('label')) */
.bold-label {
  font-size: 13px;
  font-weight: bold;
}
</style>
