<!--
  Imperative host-ref API: the seam reanimated / gesture-handler reach through.
  `measure` returns the box's real on-screen frame (only a live host can answer it);
  `setNativeProps` recolors the box bypassing Vue entirely (no reactive state, no re-render);
  `findNodeHandle` reads the committed native tag. The flash holds until the next Vue commit
  re-applies the declarative style, exactly RN's imperative-override semantics.
-->
<script setup lang="ts">
import { ref, shallowRef, onMounted } from 'vue'
import { View, Text, Button, findNodeHandle, StyleSheet, type IHostInstance } from '@symbiote/vue'

// shallowRef, NOT ref: the engine node is held by IDENTITY so measure()/setNativeProps()
// hit the engine's WeakMap mirror (a plain ref wraps it in a reactive Proxy → mirror miss).
const boxRef = shallowRef<IHostInstance | null>(null)
let flashed = false
const frame = ref('tap “Measure”')
const tag = ref<number | null>(null)

onMounted(() => {
  // The tag exists only after the first commit, so read it post-mount.
  tag.value = findNodeHandle(boxRef.value)
})

const onMeasure = (): void => {
  const box = boxRef.value
  if (box === null) return
  box.measure((x, y, width, height, pageX, pageY) => {
    frame.value =
      `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
      ` · page ${Math.round(pageX)},${Math.round(pageY)}`
  })
}

const onFlash = (): void => {
  const box = boxRef.value
  if (box === null) return
  flashed = !flashed
  box.setNativeProps({ style: { backgroundColor: flashed ? '#f6ad55' : '#42b883' } })
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  refBox: { height: 56, borderRadius: 12, backgroundColor: '#42b883', alignItems: 'center', justifyContent: 'center' },
  refBoxText: { color: '#1b2a36', fontSize: 14, fontWeight: 'bold' },
})
</script>

<template>
  <View :style="styles.section">
    <Text :style="styles.sectionLabel">Imperative ref · measure / setNativeProps / findNodeHandle</Text>
    <View testID="ref-box" ref="boxRef" :style="styles.refBox">
      <Text :style="styles.refBoxText">{{ `native tag ${tag ?? '—'}` }}</Text>
    </View>
    <Text testID="measure-frame" :style="styles.infoText">{{ `frame: ${frame}` }}</Text>
    <View :style="styles.row">
      <View :style="styles.flex1">
        <Button testID="measure-btn" title="Measure" @press="onMeasure" color="#42b883" />
      </View>
      <View :style="styles.flex1">
        <Button title="Flash (setNativeProps)" @press="onFlash" color="#f6ad55" />
      </View>
    </View>
  </View>
</template>
