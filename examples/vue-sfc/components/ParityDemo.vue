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
  FlatList,
  SectionList,
  Keyboard,
  AccessibilityInfo,
  type IHostInstance,
  type IFlatListHandle,
  type ISection,
} from '@symbiote-native/vue'
import ActionButton from './ActionButton.vue'

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

// `parityRow`'s height references the script const PARITY_ROW_H, which a CSS selector has
// no way to read — that one property stays dynamic via :style alongside the static
// `class="parity-row"` (defined in App.css) for justifyContent/padding.
const parityRowHeightStyle = { height: PARITY_ROW_H }
</script>

<template>
  <View class="section-nested">
    <Text ref="titleRef" class="section-label">Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus</Text>

    <!-- #10 Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap -->
    <Text
      @long-press="() => { longPressMsg = 'long press! (tap was suppressed)' }"
      @press="() => { longPressMsg = 'tap' }"
      class="long-press-row">{{ longPressMsg }}</Text>

    <!-- #15 Keyboard.dismiss: blurs whatever input holds focus without needing a ref -->
    <TextInput
      placeholder="focus me…"
      placeholder-text-color="#41506a"
      @focus="() => { dismissMsg = 'keyboard up — tap Hide keyboard' }"
      @blur="() => { dismissMsg = 'blurred (keyboard down)' }"
      class="focus-input"
    />
    <Text class="note-text">{{ dismissMsg }}</Text>
    <ActionButton title="Hide keyboard" :onPress="() => Keyboard.dismiss()" color="#42b883" />

    <!-- #12 animated VirtualizedList scroll: smooth (native command) vs instant.
         A fixed height with no wrapper: the vertical ScrollView clips to its own
         frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. -->
    <Text class="section-label">FlatList · animated scrollToOffset</Text>
    <FlatList
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
        <ActionButton title="Scroll ▼ animated" :onPress="scrollDown" color="#42b883" />
      </View>
      <View class="flex1">
        <ActionButton title="Top · instant" :onPress="scrollTop" color="#42b883" />
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
    <ActionButton title="Focus the panel title (a11y)" :onPress="focusTitle" color="#42b883" />
  </View>
</template>

<!-- No local <style> block here on purpose: every class this component references already
     lives in App.css; :style="parityRowHeightStyle" stays inline because it reads the script
     const PARITY_ROW_H, which a CSS selector has no way to reach. -->
