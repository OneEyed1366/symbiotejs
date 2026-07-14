<!--
  Imperative host-ref API: the seam reanimated / gesture-handler reach through.
  `measure` returns the box's real on-screen frame (only a live host can answer it);
  `setNativeProps` recolors the box bypassing Vue entirely (no reactive state, no re-render);
  `findNodeHandle` reads the committed native tag. The flash holds until the next Vue commit
  re-applies the declarative style, exactly RN's imperative-override semantics.
-->
<script setup lang="ts">
import { ref, shallowRef, onMounted } from 'vue'
import { View, Text, findNodeHandle, type IHostInstance } from '@symbiote-native/vue'
import ActionButton from './ActionButton.vue'

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
</script>

<template>
  <View class="section">
    <Text class="section-label">Imperative ref · measure / setNativeProps / findNodeHandle</Text>
    <View testID="ref-box" ref="boxRef" class="ref-box">
      <Text class="ref-box-text">{{ `native tag ${tag ?? '—'}` }}</Text>
    </View>
    <Text testID="measure-frame" class="info-text">{{ `frame: ${frame}` }}</Text>
    <View class="row">
      <View class="flex1">
        <ActionButton testID="measure-btn" title="Measure" :onPress="onMeasure" color="#42b883" />
      </View>
      <View class="flex1">
        <ActionButton title="Flash (setNativeProps)" :onPress="onFlash" color="#f6ad55" />
      </View>
    </View>
  </View>
</template>
