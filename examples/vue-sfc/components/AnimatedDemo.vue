<!--
  Animated, both drivers side by side. The pulse runs on the NATIVE driver: the
  curve lives in NativeAnimated, so zero JS runs per frame (DEBUG shows a single
  `native: startAnimatingNode`, no per-frame commits). The two slide dots run the
  SAME timing on different drivers: the JS one commits a clone every frame (DEBUG
  logs `commit … incremental` ~60×/run), the native one offloads it. Each dot keeps
  its own Animated.Value so a JS run and a native run never touch the same node.

  Animated.View is dotted, so it can't be a template tag — aliased to <AnimatedView>.
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import { View, Text, Animated, Button } from '@symbiotejs/vue';

const AnimatedView = Animated.View;

const SLIDE_DISTANCE = 220;

const pulse = new Animated.Value(0);
const jsSlide = new Animated.Value(0);
const nativeSlide = new Animated.Value(0);
const jsForward = ref(false);
const nativeForward = ref(false);

// A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
// to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
// in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
const heartbeat = Animated.loop(
  Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
);
onMounted(() => heartbeat.start());
onUnmounted(() => heartbeat.stop());

const pulseScale = pulse.interpolate({
  inputRange: [0, 0.5, 1],
  outputRange: [1, 1.3, 1],
});
const pulseOpacity = pulse.interpolate({
  inputRange: [0, 0.5, 1],
  outputRange: [0.4, 1, 0.4],
});

const slide = (
  value: typeof jsSlide,
  forward: Ref<boolean>,
  useNativeDriver: boolean,
): void => {
  Animated.timing(value, {
    toValue: forward.value ? 0 : 1,
    duration: 600,
    useNativeDriver,
  }).start();
  forward.value = !forward.value;
};

// Template refs auto-unwrap, so the buttons can't pass `jsForward`/`nativeForward` (they'd arrive
// as bare booleans, not the Ref `slide` needs). Wrap the calls in script handlers that close over
// the real refs.
const slideJsDriver = (): void => slide(jsSlide, jsForward, false);
const slideNativeDriver = (): void => slide(nativeSlide, nativeForward, true);

const jsX = jsSlide.interpolate({
  inputRange: [0, 1],
  outputRange: [0, SLIDE_DISTANCE],
});
const nativeX = nativeSlide.interpolate({
  inputRange: [0, 1],
  outputRange: [0, SLIDE_DISTANCE],
});

// Proof of offload (ADR 0017): kick both slides, then jam the JS thread for 1.5s.
// The native-driven pulse + green slide keep moving on the UI side through the
// freeze; the JS-driven orange slide stalls until the thread is released. If the
// "native" path had silently fallen back to JS, the pulse would freeze too.
const freezeJs = (): void => {
  slide(jsSlide, jsForward, false);
  slide(nativeSlide, nativeForward, true);
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    // Intentionally block the JS thread: no requestAnimationFrame can fire here.
  }
};

// Every static look lives in the <style scoped> block below (symbiote-sfc-style-compiler
// skill). pulseDot/jsSlideDot/nativeSlideDot split: their static width/height/borderRadius/
// backgroundColor move to a class, the runtime opacity/transform interpolations stay :style
// on the same element (frontend-ux "style only for dynamics").
</script>

<template>
  <View class="section">
    <Text class="section-label">Animated · JS vs native driver</Text>

    <!-- native-driven perpetual pulse -->
    <View class="pulse-frame">
      <AnimatedView
        testID="pulse-dot"
        class="pulse-dot"
        :style="{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }"
      />
    </View>

    <!-- JS-driven slide: a commit per frame -->
    <View class="slide-track">
      <AnimatedView
        testID="slide-js-dot"
        class="js-slide-dot"
        :style="{ transform: [{ translateX: jsX }] }"
      />
    </View>
    <Button
      testID="slide-js-btn"
      title="Slide (JS driver)"
      @press="slideJsDriver"
      color="#f6ad55"
    />

    <!-- native-driven slide: offloaded, zero JS frames -->
    <View class="slide-track">
      <AnimatedView
        testID="slide-native-dot"
        class="native-slide-dot"
        :style="{ transform: [{ translateX: nativeX }] }"
      />
    </View>
    <Button
      testID="slide-native-btn"
      title="Slide (native driver)"
      @press="slideNativeDriver"
      color="#68d391"
    />

    <!-- Freeze the JS thread 1.5s: native (pulse + green) keep moving, JS (orange) stalls -->
    <Button
      testID="freeze-js-btn"
      title="Freeze JS 1.5s"
      @press="freezeJs"
      color="#fc8181"
    />
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
.pulse-frame {
  height: 64px;
  align-items: center;
  justify-content: center;
}
.pulse-dot {
  width: 48px;
  height: 48px;
  border-radius: 24px;
  background-color: #42b883;
}
.slide-track {
  height: 36px;
  justify-content: center;
}
.js-slide-dot {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background-color: #f6ad55;
}
.native-slide-dot {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background-color: #68d391;
}
</style>
