<!--
  Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) — a bare
  Button renders as unstyled tinted text on iOS, visually indistinguishable from a body Text line,
  which was the single biggest source of "looks messy" across the demo app (2026-07 cohesion
  pass). One consistent bordered pill, tinted in the caller's own `color` exactly like Button
  already took, so every screen's per-feature color-coding is preserved — only the chrome becomes
  consistent. Vue SFC twin of .examples/react/components/ActionButton.tsx: `onPress` stays a
  plain callback PROP (not a Vue `@press` emit) to mirror React's exact title/onPress/color/testID
  surface byte-for-byte across every screen that uses it.
-->
<script setup lang="ts">
import { Pressable, Text } from '@symbiote-native/vue';

const props = defineProps<{
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
}>();

// Pressable's `style` prop is a FUNCTION of press state (RN's own idiom, mirrored by
// @symbiote-native/vue's Pressable) — see App.vue's own pressableStyle/retentionStyle for the
// same shape.
const actionButtonStyle = ({ pressed }: { pressed: boolean }) => ({
  borderColor: props.color,
  opacity: pressed ? 0.6 : 1,
});
</script>

<template>
  <Pressable :testID="testID" @press="onPress" class="action-button" :style="actionButtonStyle">
    <Text class="action-button-text" :style="{ color }">{{ title }}</Text>
  </Pressable>
</template>
