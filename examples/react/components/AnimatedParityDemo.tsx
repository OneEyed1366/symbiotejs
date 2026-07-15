import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, PanResponder } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';

const XY_SPAN = 96;
const TRACK_DISTANCE = 200;
const HEADER_COLLAPSE = 60;

// The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
// and diffClamp (a collapsing header). Each is a thin port of the RN node.
export function AnimatedParityDemo() {
  // --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
  // Track the resting position in a ref; each move sets the absolute position
  // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
  // frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
  const DRAG_MAX = XY_SPAN - 12;
  const xy = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const restingPos = useRef({ x: 0, y: 0 });
  const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n));
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => {
        xy.setValue({
          x: clamp(restingPos.current.x + gesture.dx),
          y: clamp(restingPos.current.y + gesture.dy),
        });
      },
      onPanResponderRelease: (_event, gesture) => {
        restingPos.current = {
          x: clamp(restingPos.current.x + gesture.dx),
          y: clamp(restingPos.current.y + gesture.dy),
        };
      },
    }),
  ).current;

  // --- Tracking: a follower spring-chases a lead value that animates on tap ---
  const lead = useRef(new Animated.Value(0)).current;
  const follow = useRef(new Animated.Value(0)).current;
  const [leadForward, setLeadForward] = useState(false);
  useEffect(() => {
    // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
    // follower lags and chases rather than jumping, the tracking signature.
    Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start();
    return () => follow.stopAnimation();
  }, [follow, lead]);
  const moveLead = (): void => {
    Animated.timing(lead, {
      toValue: leadForward ? 0 : TRACK_DISTANCE,
      duration: 700,
      useNativeDriver: false,
    }).start();
    setLeadForward(!leadForward);
  };

  // --- diffClamp: a header that collapses as you scroll down, reveals on up ---
  const scroll = useRef(new Animated.Value(0)).current;
  const scrollPos = useRef(0);
  const headerOffset = useRef(
    Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
      inputRange: [0, HEADER_COLLAPSE],
      outputRange: [0, -HEADER_COLLAPSE],
    }),
  ).current;
  const scrollBy = (delta: number): void => {
    scrollPos.current = Math.max(0, scrollPos.current + delta);
    Animated.timing(scroll, {
      toValue: scrollPos.current,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View className="section-nested">
      <Text className="section-label">
        Animated · ValueXY / tracking / diffClamp
      </Text>

      {/* ValueXY box you drag with a finger (PanResponder) */}
      <Text className="drag-hint">drag the purple box →</Text>
      <View className="xy-frame">
        <Animated.View
          {...panResponder.panHandlers}
          className="xy-box"
          style={{ transform: xy.getTranslateTransform() }}
        />
      </View>

      {/* Tracking: lead dot (blue) and follower (orange) that lags behind it */}
      <View className="track-row">
        <Animated.View
          className="lead-dot"
          style={{ transform: [{ translateX: lead }] }}
        />
      </View>
      <View className="track-row">
        <Animated.View
          testID="follow-dot"
          className="follow-dot"
          style={{ transform: [{ translateX: follow }] }}
        />
      </View>
      <ActionButton
        testID="track-btn"
        title="Move target (follower chases)"
        onPress={moveLead}
        color="#4299e1"
      />

      {/* diffClamp collapsing header */}
      <View className="collapse-frame">
        <Animated.View
          className="collapse-header"
          style={{ transform: [{ translateY: headerOffset }] }}
        >
          <Text className="collapse-header-text">collapsing header</Text>
        </Animated.View>
      </View>
      <View className="row-tight">
        <View className="flex1">
          <ActionButton
            title="Scroll ↓"
            onPress={() => scrollBy(40)}
            color="#38b2ac"
          />
        </View>
        <View className="flex1">
          <ActionButton
            title="Scroll ↑"
            onPress={() => scrollBy(-40)}
            color="#38b2ac"
          />
        </View>
      </View>
    </View>
  );
}
