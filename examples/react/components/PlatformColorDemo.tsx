import { View, Text, useColorScheme, PlatformColor, DynamicColorIOS } from '@symbiote-native/react';

// PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
// become iOS UIColor selectors, and the dynamic tuple flips with the system
// appearance. The opaque color objects flow through the same color seam as CSS
// strings (processColor), so no special handling reaches Fabric. Name resolution is
// device-only: a wrong name silently falls back, so this is verified on simulator.
export function PlatformColorDemo() {
  const scheme = useColorScheme();
  return (
    <View className="section-nested">
      <Text className="section-label">
        {`PlatformColor · semantic + DynamicColorIOS (${scheme ?? 'unknown'})`}
      </Text>
      <View className="row">
        <View
          className="color-tile"
          style={{ backgroundColor: PlatformColor('systemBlue') }}
        >
          <Text className="tile-label">systemBlue</Text>
        </View>
        <View
          className="color-tile-bordered"
          style={{
            backgroundColor: DynamicColorIOS({
              light: '#dbeafe',
              dark: '#13243a',
            }),
            borderColor: PlatformColor('separator'),
          }}
        >
          <Text
            className="bold-label"
            style={{ color: PlatformColor('label') }}
          >
            dynamic
          </Text>
        </View>
      </View>
    </View>
  );
}
