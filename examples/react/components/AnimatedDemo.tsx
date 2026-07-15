import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';

const SLIDE_DISTANCE = 220;

// Animated, both drivers side by side. The pulse runs on the NATIVE driver: the
// curve lives in NativeAnimated, so zero JS runs per frame (DEBUG shows a single
// `native: startAnimatingNode`, no per-frame commits). The two slide dots run the
// SAME timing on different drivers: the JS one commits a clone every frame (DEBUG
// logs `commit … incremental` ~60×/run), the native one offloads it. Each dot keeps
// its own Animated.Value so a JS run and a native run never touch the same node.
export function AnimatedDemo() {
  const pulse = useRef(new Animated.Value(0)).current;
  const jsSlide = useRef(new Animated.Value(0)).current;
  const nativeSlide = useRef(new Animated.Value(0)).current;
  const [jsForward, setJsForward] = useState(false);
  const [nativeForward, setNativeForward] = useState(false);

  // A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
  // to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
  // in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

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
    forward: boolean,
    setForward: (next: boolean) => void,
    useNativeDriver: boolean,
  ): void => {
    Animated.timing(value, {
      toValue: forward ? 0 : 1,
      duration: 600,
      useNativeDriver,
    }).start();
    setForward(!forward);
  };

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
    slide(jsSlide, jsForward, setJsForward, false);
    slide(nativeSlide, nativeForward, setNativeForward, true);
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      // Intentionally block the JS thread: no requestAnimationFrame can fire here.
    }
  };

  return (
    <View className="section-nested">
      <Text className="section-label">Animated · JS vs native driver</Text>

      {/* native-driven perpetual pulse */}
      <View className="pulse-frame">
        <Animated.View
          testID="pulse-dot"
          className="pulse-dot"
          style={{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }}
        />
      </View>

      {/* JS-driven slide: a commit per frame */}
      <View className="slide-track">
        <Animated.View
          testID="slide-js-dot"
          className="js-slide-dot"
          style={{ transform: [{ translateX: jsX }] }}
        />
      </View>
      <ActionButton
        testID="slide-js-btn"
        title="Slide (JS driver)"
        onPress={() => slide(jsSlide, jsForward, setJsForward, false)}
        color="#f6ad55"
      />

      {/* native-driven slide: offloaded, zero JS frames */}
      <View className="slide-track">
        <Animated.View
          testID="slide-native-dot"
          className="native-slide-dot"
          style={{ transform: [{ translateX: nativeX }] }}
        />
      </View>
      <ActionButton
        testID="slide-native-btn"
        title="Slide (native driver)"
        onPress={() =>
          slide(nativeSlide, nativeForward, setNativeForward, true)
        }
        color="#68d391"
      />

      {/* Freeze the JS thread 1.5s: native (pulse + green) keep moving, JS (orange) stalls */}
      <ActionButton title="Freeze JS 1.5s" onPress={freezeJs} color="#fc8181" />
    </View>
  );
}
