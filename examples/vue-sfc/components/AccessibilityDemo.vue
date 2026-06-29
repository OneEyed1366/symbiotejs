<!--
  Accessibility: the props reach native unchanged (accessibilityLabel -> Android
  content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
  the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
  never reach native), and AccessibilityInfo reads device state + drives announce.
  Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
  logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { View, Text, AccessibilityInfo, StyleSheet } from '@symbiote/vue'

const screenReader = ref('querying…')

onMounted(() => {
  // A non-throwing getter proves the native module name resolved (Android
  // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
  AccessibilityInfo.isScreenReaderEnabled()
    .then(enabled => { screenReader.value = enabled ? 'on' : 'off' })
    .catch(() => { screenReader.value = 'unavailable' })
  AccessibilityInfo.announceForAccessibility('symbiote accessibility online')
})

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  a11yCard: { padding: 12, borderRadius: 10, backgroundColor: '#2c3e50' },
})
</script>

<template>
  <View :style="styles.section">
    <Text :style="styles.sectionLabel">Accessibility · props → native · aria/role transform · AccessibilityInfo</Text>
    <!-- getter readout: 'off' (no screen reader) proves the module resolved -->
    <Text :style="styles.infoText">{{ `screen reader: ${screenReader}` }}</Text>
    <!-- canonical accessibility*: content-desc 'a11y-canonical-label' + role=header -->
    <View :accessible="true" accessibility-role="header" accessibility-label="a11y-canonical-label" :style="styles.a11yCard">
      <Text :style="styles.infoText">canonical label + role=header</Text>
    </View>
    <!-- web aria and role aliases MUST fold: content-desc should be
         'a11y-aria-label', a raw aria-label attribute must not reach the native node -->
    <View :accessible="true" role="button" aria-label="a11y-aria-label" :style="styles.a11yCard">
      <Text :style="styles.infoText">aria-label + role=button</Text>
    </View>
    <!-- accessibilityState: uiautomator shows enabled=false / selected=true -->
    <View :accessible="true" accessibility-label="a11y-state" :accessibility-state="{ disabled: true, selected: true }" :style="styles.a11yCard">
      <Text :style="styles.infoText">state: disabled + selected</Text>
    </View>
  </View>
</template>
