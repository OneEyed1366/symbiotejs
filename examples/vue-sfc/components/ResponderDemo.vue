<!--
  Responder: the gesture capabilities exposed here, shown so the grabbed
  element is the one that moves. Each chip is its OWN responder: it grabs on touch
  start and drags ITSELF (onResponderMove translates that chip). Drag a chip past a
  threshold and the surrounding strip STEALS the gesture: its onMoveShouldSetResponder
  fires once the finger has travelled far enough, the chip yields (onResponder-
  TerminationRequest -> terminate, so it snaps back) and the strip pans the whole row.
  A small drag moves the digit; a big drag hands off to the strip: move-should-set and
  transfer, each visible (and the separate "transfer" line lights on the hand-off).
  DEBUG logcat shows "responder transferred ... -> ..." at that moment.
-->
<script setup lang="ts">
import { ref } from 'vue'
import { View, Text, StyleSheet, type ISymbioteEvent } from '@symbiote/vue'

const RESPONDER_CHIPS = [0, 1, 2, 3, 4]
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64

function firstTouchX(event: ISymbioteEvent): number {
  const touches = event.nativeEvent.touches
  if (!Array.isArray(touches) || touches.length === 0) return 0
  const first: unknown = touches[0]
  if (typeof first === 'object' && first !== null && 'pageX' in first) {
    const pageX = first.pageX
    return typeof pageX === 'number' ? pageX : 0
  }
  return 0
}

const activeChip = ref<number | null>(null)
const chipDx = ref(0)
const rowDx = ref(0)
const status = ref('tap a chip · drag it to move · drag far → strip steals it')
const transfer = ref('')
let startX = 0
let panStartX = 0
let grabbed: number | null = null

// The strip claims the gesture only once the finger has travelled past the threshold,
// stealing it from whichever chip currently holds it, the transfer path.
const onStripMoveShouldSet = (event: ISymbioteEvent): boolean =>
  grabbed !== null && Math.abs(firstTouchX(event) - startX) > RESPONDER_STEAL_DX
const onStripGrant = (event: ISymbioteEvent): void => {
  transfer.value = `↯ strip stole the gesture from chip ${grabbed ?? '?'}`
  activeChip.value = null
  chipDx.value = 0
  panStartX = firstTouchX(event)
  status.value = 'strip panning'
}
const onStripMove = (event: ISymbioteEvent): void => { rowDx.value = firstTouchX(event) - panStartX }
const onStripRelease = (): void => { rowDx.value = 0; status.value = 'strip released' }
const onStripTerminate = (): void => { rowDx.value = 0 }

// Each chip grabs on start and drags itself; yields to the strip past the threshold.
const onChipStartShouldSet = (): boolean => true
const onChipGrant = (index: number, event: ISymbioteEvent): void => {
  startX = firstTouchX(event)
  grabbed = index
  activeChip.value = index
  chipDx.value = 0
  rowDx.value = 0
  transfer.value = ''
  status.value = `chip ${index} grabbed`
}
const onChipMove = (index: number, event: ISymbioteEvent): void => {
  const dx = firstTouchX(event) - startX
  chipDx.value = dx
  status.value = `chip ${index} moving · dx=${Math.round(dx)}`
}
const onChipTerminationRequest = (): boolean => true
const onChipTerminate = (): void => { chipDx.value = 0; activeChip.value = null }
const onChipRelease = (index: number): void => {
  chipDx.value = 0
  activeChip.value = null
  status.value = `chip ${index} released`
}

const styles = StyleSheet.create({
  sectionTight: { gap: 8 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  rowTight: { flexDirection: 'row', gap: 8 },
  transferText: { fontSize: 13 },
  stripBox: { padding: 12, borderRadius: 12, backgroundColor: '#2c3e50' },
  chip: { width: 56, height: 48, borderRadius: 8, backgroundColor: '#369870', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
})
</script>

<template>
  <View :style="styles.sectionTight">
    <Text :style="styles.sectionLabel">Responder · drag a chip vs hand-off to the strip</Text>
    <Text :style="styles.infoText">{{ status }}</Text>
    <!-- the separate transfer indicator, lit only when the strip steals the gesture -->
    <Text :style="[styles.transferText, { color: transfer ? '#f6ad55' : '#3b5266' }]">{{ transfer || 'transfer: —' }}</Text>
    <View
      @move-should-set-responder="onStripMoveShouldSet"
      @responder-grant="onStripGrant"
      @responder-move="onStripMove"
      @responder-release="onStripRelease"
      @responder-terminate="onStripTerminate"
      :style="styles.stripBox">
      <View :style="[styles.rowTight, { transform: [{ translateX: rowDx }] }]">
        <View
          v-for="index in RESPONDER_CHIPS"
          :key="index"
          :testID="`resp-chip-${index}`"
          @start-should-set-responder="onChipStartShouldSet"
          @responder-grant="(event) => onChipGrant(index, event)"
          @responder-move="(event) => onChipMove(index, event)"
          @responder-termination-request="onChipTerminationRequest"
          @responder-terminate="onChipTerminate"
          @responder-release="() => onChipRelease(index)"
          :style="[styles.chip, { borderColor: activeChip === index ? '#42b883' : 'transparent', transform: [{ translateX: activeChip === index ? chipDx : 0 }] }]">
          <Text :style="styles.chipText">{{ index }}</Text>
        </View>
      </View>
    </View>
  </View>
</template>
