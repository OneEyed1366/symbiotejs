<!--
  Verification panel for five feature-parity behaviors with no prior canary surface:
  Text.onLongPress synthesis, Keyboard.dismiss (blur the focused input), animated
  VirtualizedList scroll, sticky SectionList headers, and Android setAccessibilityFocus.
  Each leaves a dlog seam (DEBUG=1 -> logcat) and a visible effect, so a real host
  confirms what the headless smokes prove in JS.

  FlatList/SectionList render via Vue scoped slots — #item / #sectionHeader — the idiomatic
  Vue surface (the adapter maps them onto the renderItem family internally).
-->
<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  SectionList,
  Keyboard,
  AccessibilityInfo,
  type IHostInstance,
  type IFlatListHandle,
  type ISection,
} from '@symbiote/vue'

const PARITY_ROW_H = 30
const parityRows = Array.from({ length: 30 }, (_unused, index) => ({ id: `pr-${index}`, n: index }))
// Tall sections (taller than the list viewport) so the sticky cross-talk is visible: as
// you scroll, the next section header should reach the top and PUSH the pinned one off.
const sectionData = (prefix: string, label: string): { id: string; label: string }[] =>
  Array.from({ length: 8 }, (_unused, index) => ({ id: `${prefix}${index}`, label: `${label} ${index}` }))
const paritySections: ISection<{ id: string; label: string }>[] = [
  { title: 'Fruit', data: sectionData('f', 'apple') },
  { title: 'Tools', data: sectionData('t', 'hammer') },
  { title: 'Cities', data: sectionData('c', 'porto') },
]

const listRef = shallowRef<IFlatListHandle | null>(null)
const titleRef = shallowRef<IHostInstance | null>(null)
const longPressMsg = ref('long-press or tap the row below')
const dismissMsg = ref('focus the field, then Hide keyboard')

const keyExtractor = (item: { id: string; n: number }): string => item.id
const getItemLayout = (_data: unknown, index: number): { length: number; offset: number; index: number } =>
  ({ length: PARITY_ROW_H, offset: PARITY_ROW_H * index, index })
const sectionKeyExtractor = (item: { id: string; label: string }): string => item.id

const scrollDown = (): void => { listRef.value?.scrollToOffset({ offset: 20 * PARITY_ROW_H, animated: true }) }
const scrollTop = (): void => { listRef.value?.scrollToOffset({ offset: 0, animated: false }) }
const focusTitle = (): void => {
  if (titleRef.value !== null) {
    AccessibilityInfo.sendAccessibilityEvent(titleRef.value, 'focus')
  }
}

// Every static look lives in the <style scoped> block below (symbiote-sfc-style-compiler
// skill). `parityRow`'s height references the script const PARITY_ROW_H, which a CSS
// selector has no way to read — that one property stays dynamic via :style alongside the
// static `class="parity-row"` for justifyContent/padding.
const parityRowHeightStyle = { height: PARITY_ROW_H }
</script>

<template>
  <View class="section">
    <Text testID="panel-title" ref="titleRef" class="section-label">Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus</Text>

    <!-- #10 Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap -->
    <Text
      testID="long-press-msg"
      @long-press="() => { longPressMsg = 'long press! (tap was suppressed)' }"
      @press="() => { longPressMsg = 'tap' }"
      class="long-press-row">{{ longPressMsg }}</Text>

    <!-- #15 Keyboard.dismiss: blurs whatever input holds focus without needing a ref -->
    <TextInput
      testID="dismiss-focus-input"
      placeholder="focus me…"
      placeholder-text-color="#3b5266"
      @focus="() => { dismissMsg = 'keyboard up — tap Hide keyboard' }"
      @blur="() => { dismissMsg = 'blurred (keyboard down)' }"
      class="focus-input"
    />
    <Text testID="dismiss-msg" class="note-text">{{ dismissMsg }}</Text>
    <Button testID="hide-keyboard-btn" title="Hide keyboard" @press="() => Keyboard.dismiss()" color="#42b883" />

    <!-- #12 animated VirtualizedList scroll: smooth (native command) vs instant.
         A fixed height with no wrapper: the vertical ScrollView clips to its own
         frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. -->
    <Text class="section-label">FlatList · animated scrollToOffset</Text>
    <FlatList
      testID="parity-flat-list"
      ref="listRef"
      :data="parityRows"
      :key-extractor="keyExtractor"
      :get-item-layout="getItemLayout"
      class="parity-list"
    >
      <template #item="{ item }">
        <View class="parity-row" :style="parityRowHeightStyle">
          <Text class="info-text">row {{ item.n }}</Text>
        </View>
      </template>
    </FlatList>
    <View class="row">
      <View class="flex1">
        <Button testID="parity-scroll-down-btn" title="Scroll ▼ animated" @press="scrollDown" color="#42b883" />
      </View>
      <View class="flex1">
        <Button testID="parity-scroll-top-btn" title="Top · instant" @press="scrollTop" color="#42b883" />
      </View>
    </View>

    <!-- #13 sticky section headers. Drag the inner list: each header pins at the top.
         Cross-talk check: as the NEXT header reaches the top it should PUSH the pinned
         one off (nextHeaderLayoutY not yet wired, watch push vs overlap). -->
    <Text class="section-label">SectionList · sticky (scroll: next header should push prev off)</Text>
    <SectionList
      testID="sticky-section-list"
      :sections="paritySections"
      :key-extractor="sectionKeyExtractor"
      :sticky-section-headers-enabled="true"
      class="section-list"
    >
      <template #sectionHeader="{ section }">
        <Text class="section-header">{{ section.title }}</Text>
      </template>
      <template #item="{ item }">
        <View class="parity-row" :style="parityRowHeightStyle">
          <Text class="info-text">{{ item.label }}</Text>
        </View>
      </template>
    </SectionList>

    <!-- #14 a11y focus: node-based sendAccessibilityEvent routes through the Fabric
         slot on both platforms (enable TalkBack/VoiceOver to feel the focus jump) -->
    <Button testID="focus-title-btn" title="Focus the panel title (a11y)" @press="focusTitle" color="#42b883" />
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
.info-text {
  color: #cbd5e1;
  font-size: 14px;
}
.note-text {
  color: #cbd5e1;
  font-size: 13px;
}
.row {
  flex-direction: row;
  gap: 12px;
}
.flex1 {
  flex: 1;
}
.long-press-row {
  color: #cbd5e1;
  font-size: 15px;
  padding: 12px;
  border-radius: 10px;
  background-color: #2c3e50;
}
.focus-input {
  color: #e2e8f0;
  padding: 12px;
  border-radius: 10px;
  background-color: #22323f;
  border-width: 1px;
  border-color: #369870;
}
.parity-list {
  height: 120px;
  border-radius: 10px;
  background-color: #22323f;
}
/* height stays dynamic (:style="parityRowHeightStyle") — it references the script
     const PARITY_ROW_H, which a CSS selector has no way to read */
.parity-row {
  justify-content: center;
  padding-left: 12px;
  padding-right: 12px;
}
.section-list {
  height: 200px;
  border-radius: 10px;
  background-color: #22323f;
}
.section-header {
  color: #1b2a36;
  font-size: 13px;
  font-weight: bold;
  padding-top: 6px;
  padding-bottom: 6px;
  padding-left: 12px;
  padding-right: 12px;
  background-color: #42b883;
}
</style>
