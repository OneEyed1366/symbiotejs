<!--
  The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
  and diffClamp (a collapsing header). Each is a thin port of the RN node.

  A JSX `{...panResponder.panHandlers}` spread becomes `v-bind="panResponder.panHandlers"`;
  Animated.View is aliased to <AnimatedView> (a dotted name can't be a template tag).
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { View, Text, Animated, Button, PanResponder, StyleSheet } from '@symbiote/vue'

const AnimatedView = Animated.View

const XY_SPAN = 96
const TRACK_DISTANCE = 200
const HEADER_COLLAPSE = 60

// --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
// Track the resting position in a plain object; each move sets the absolute position
// (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
// frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
const DRAG_MAX = XY_SPAN - 12
const xy = new Animated.ValueXY({ x: 0, y: 0 })
const restingPos = { x: 0, y: 0 }
const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n))
const panResponder = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onMoveShouldSetPanResponder: () => true,
  onPanResponderMove: (_event, gesture) => {
    xy.setValue({
      x: clamp(restingPos.x + gesture.dx),
      y: clamp(restingPos.y + gesture.dy),
    })
  },
  onPanResponderRelease: (_event, gesture) => {
    restingPos.x = clamp(restingPos.x + gesture.dx)
    restingPos.y = clamp(restingPos.y + gesture.dy)
  },
})

// --- Tracking: a follower spring-chases a lead value that animates on tap ---
const lead = new Animated.Value(0)
const follow = new Animated.Value(0)
const leadForward = ref(false)
onMounted(() => {
  // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
  // follower lags and chases rather than jumping, the tracking signature.
  Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start()
})
onUnmounted(() => follow.stopAnimation())
const moveLead = (): void => {
  Animated.timing(lead, {
    toValue: leadForward.value ? 0 : TRACK_DISTANCE,
    duration: 700,
    useNativeDriver: false,
  }).start()
  leadForward.value = !leadForward.value
}

// --- diffClamp: a header that collapses as you scroll down, reveals on up ---
const scroll = new Animated.Value(0)
let scrollPos = 0
const headerOffset = Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
  inputRange: [0, HEADER_COLLAPSE],
  outputRange: [0, -HEADER_COLLAPSE],
})
const scrollBy = (delta: number): void => {
  scrollPos = Math.max(0, scrollPos + delta)
  Animated.timing(scroll, { toValue: scrollPos, duration: 180, useNativeDriver: false }).start()
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  rowTight: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  dragHint: { color: '#718096', fontSize: 11 },
  xyFrame: { width: XY_SPAN + 36, height: XY_SPAN + 36, borderRadius: 12, backgroundColor: '#eef7f2', padding: 6 },
  xyBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#9f7aea' },
  trackRow: { height: 30, justifyContent: 'center' },
  leadDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#42b883' },
  followDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f6ad55' },
  collapseFrame: { height: HEADER_COLLAPSE + 24, overflow: 'hidden', justifyContent: 'flex-start' },
  collapseHeader: { height: HEADER_COLLAPSE, borderRadius: 8, backgroundColor: '#38b2ac', alignItems: 'center', justifyContent: 'center' },
  collapseHeaderText: { color: 'white', fontSize: 12 },
})
</script>

<template>
  <View :style="styles.section">
    <Text :style="styles.sectionLabel">Animated · ValueXY / tracking / diffClamp</Text>

    <!-- ValueXY box you drag with a finger (PanResponder) -->
    <Text :style="styles.dragHint">drag the purple box →</Text>
    <View :style="styles.xyFrame">
      <AnimatedView v-bind="panResponder.panHandlers" :style="[styles.xyBox, { transform: xy.getTranslateTransform() }]" />
    </View>

    <!-- Tracking: lead dot (blue) and follower (orange) that lags behind it -->
    <View :style="styles.trackRow">
      <AnimatedView :style="[styles.leadDot, { transform: [{ translateX: lead }] }]" />
    </View>
    <View :style="styles.trackRow">
      <AnimatedView testID="follow-dot" :style="[styles.followDot, { transform: [{ translateX: follow }] }]" />
    </View>
    <Button testID="track-btn" title="Move target (follower chases)" @press="moveLead" color="#42b883" />

    <!-- diffClamp collapsing header -->
    <View :style="styles.collapseFrame">
      <AnimatedView :style="[styles.collapseHeader, { transform: [{ translateY: headerOffset }] }]">
        <Text :style="styles.collapseHeaderText">collapsing header</Text>
      </AnimatedView>
    </View>
    <View :style="styles.rowTight">
      <View :style="styles.flex1">
        <Button title="Scroll ↓" @press="() => scrollBy(40)" color="#38b2ac" />
      </View>
      <View :style="styles.flex1">
        <Button title="Scroll ↑" @press="() => scrollBy(-40)" color="#38b2ac" />
      </View>
    </View>
  </View>
</template>
