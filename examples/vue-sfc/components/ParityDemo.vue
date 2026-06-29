<!--
  Verification panel for five feature-parity behaviors with no prior canary surface:
  Text.onLongPress synthesis, Keyboard.dismiss (blur the focused input), animated
  VirtualizedList scroll, sticky SectionList headers, and Android setAccessibilityFocus.
  Each leaves a dlog seam (DEBUG=1 -> logcat) and a visible effect, so a real host
  confirms what the headless smokes prove in JS.

  FlatList/SectionList take renderItem/renderSectionHeader as PROP functions returning a
  VNode (the adapter has no render slot), so those are built with h() in script and bound.
-->
<script setup lang="ts">
import { ref, shallowRef, h } from 'vue'
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  SectionList,
  Keyboard,
  AccessibilityInfo,
  StyleSheet,
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
const parityRenderItem = ({ item }: { item: { id: string; n: number } }) =>
  h(View, { style: styles.parityRow }, [h(Text, { style: styles.infoText }, `row ${item.n}`)])

const sectionKeyExtractor = (item: { id: string; label: string }): string => item.id
const renderSectionHeader = ({ section }: { section: { title: string } }) =>
  h(Text, { style: styles.sectionHeader }, section.title)
const sectionRenderItem = ({ item }: { item: { id: string; label: string } }) =>
  h(View, { style: styles.parityRow }, [h(Text, { style: styles.infoText }, item.label)])

const scrollDown = (): void => { listRef.value?.scrollToOffset({ offset: 20 * PARITY_ROW_H, animated: true }) }
const scrollTop = (): void => { listRef.value?.scrollToOffset({ offset: 0, animated: false }) }
const focusTitle = (): void => {
  if (titleRef.value !== null) {
    AccessibilityInfo.sendAccessibilityEvent(titleRef.value, 'focus')
  }
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  noteText: { color: '#cbd5e1', fontSize: 13 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  longPressRow: { color: '#cbd5e1', fontSize: 15, padding: 12, borderRadius: 10, backgroundColor: '#2c3e50' },
  focusInput: { color: '#e2e8f0', padding: 12, borderRadius: 10, backgroundColor: '#22323f', borderWidth: 1, borderColor: '#369870' },
  parityList: { height: 120, borderRadius: 10, backgroundColor: '#22323f' },
  parityRow: { height: PARITY_ROW_H, justifyContent: 'center', paddingHorizontal: 12 },
  sectionList: { height: 200, borderRadius: 10, backgroundColor: '#22323f' },
  sectionHeader: { color: '#1b2a36', fontSize: 13, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#42b883' },
})
</script>

<template>
  <View :style="styles.section">
    <Text ref="titleRef" :style="styles.sectionLabel">Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus</Text>

    <!-- #10 Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap -->
    <Text
      @long-press="() => { longPressMsg = 'long press! (tap was suppressed)' }"
      @press="() => { longPressMsg = 'tap' }"
      :style="styles.longPressRow">{{ longPressMsg }}</Text>

    <!-- #15 Keyboard.dismiss: blurs whatever input holds focus without needing a ref -->
    <TextInput
      placeholder="focus me…"
      placeholder-text-color="#3b5266"
      @focus="() => { dismissMsg = 'keyboard up — tap Hide keyboard' }"
      @blur="() => { dismissMsg = 'blurred (keyboard down)' }"
      :style="styles.focusInput"
    />
    <Text :style="styles.noteText">{{ dismissMsg }}</Text>
    <Button title="Hide keyboard" @press="() => Keyboard.dismiss()" color="#42b883" />

    <!-- #12 animated VirtualizedList scroll: smooth (native command) vs instant.
         A fixed height with no wrapper: the vertical ScrollView clips to its own
         frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. -->
    <Text :style="styles.sectionLabel">FlatList · animated scrollToOffset</Text>
    <FlatList
      ref="listRef"
      :data="parityRows"
      :key-extractor="keyExtractor"
      :get-item-layout="getItemLayout"
      :style="styles.parityList"
      :render-item="parityRenderItem"
    />
    <View :style="styles.row">
      <View :style="styles.flex1">
        <Button title="Scroll ▼ animated" @press="scrollDown" color="#42b883" />
      </View>
      <View :style="styles.flex1">
        <Button title="Top · instant" @press="scrollTop" color="#42b883" />
      </View>
    </View>

    <!-- #13 sticky section headers. Drag the inner list: each header pins at the top.
         Cross-talk check: as the NEXT header reaches the top it should PUSH the pinned
         one off (nextHeaderLayoutY not yet wired, watch push vs overlap). -->
    <Text :style="styles.sectionLabel">SectionList · sticky (scroll: next header should push prev off)</Text>
    <SectionList
      testID="sticky-section-list"
      :sections="paritySections"
      :key-extractor="sectionKeyExtractor"
      :sticky-section-headers-enabled="true"
      :style="styles.sectionList"
      :render-section-header="renderSectionHeader"
      :render-item="sectionRenderItem"
    />

    <!-- #14 a11y focus: node-based sendAccessibilityEvent routes through the Fabric
         slot on both platforms (enable TalkBack/VoiceOver to feel the focus jump) -->
    <Button title="Focus the panel title (a11y)" @press="focusTitle" color="#42b883" />
  </View>
</template>
