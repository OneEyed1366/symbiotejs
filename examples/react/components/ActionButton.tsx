import { Pressable, Text } from '@symbiote-native/react';

type IActionButtonProps = {
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
};

// Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) —
// a bare Button renders as unstyled tinted text on iOS, visually indistinguishable from a body
// Text line, which was the single biggest source of "looks messy" across the demo app (2026-07
// cohesion pass). One consistent bordered pill, tinted in the caller's own `color` exactly like
// Button already took, so every screen's per-feature color-coding (e.g. AnimatedDemo's JS-vs-
// native pairing) is preserved — only the chrome becomes consistent.
export function ActionButton({ title, onPress, color, testID }: IActionButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      className="action-button"
      style={({ pressed }) => ({ borderColor: color, opacity: pressed ? 0.6 : 1 })}
    >
      <Text className="action-button-text" style={{ color }}>
        {title}
      </Text>
    </Pressable>
  );
}
