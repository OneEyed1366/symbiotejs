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
import { View, Text, type ISymbioteEvent } from '@symbiote-native/vue'
import { firstTouchX } from './event-utils'

const RESPONDER_CHIPS = [0, 1, 2, 3, 4]
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64

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
</script>

<template>
  <View class="section-tight">
    <Text class="section-label">Responder · drag a chip vs hand-off to the strip</Text>
    <Text class="info-text">{{ status }}</Text>
    <!-- the separate transfer indicator, lit only when the strip steals the gesture -->
    <Text class="transfer-text" :style="{ color: transfer ? '#f6ad55' : '#41506a' }">{{ transfer || 'transfer: —' }}</Text>
    <View
      @move-should-set-responder="onStripMoveShouldSet"
      @responder-grant="onStripGrant"
      @responder-move="onStripMove"
      @responder-release="onStripRelease"
      @responder-terminate="onStripTerminate"
      class="strip-box">
      <View class="row-tight" :style="{ transform: [{ translateX: rowDx }] }">
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
          class="chip"
          :style="{
            borderColor: activeChip === index ? '#42b883' : 'transparent',
            transform: [{ translateX: activeChip === index ? chipDx : 0 }],
          }">
          <Text class="chip-text">{{ index }}</Text>
        </View>
      </View>
    </View>
  </View>
</template>

<!-- No local <style> block here on purpose: every class this component references already
     lives in App.css. -->
