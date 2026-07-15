import { useCallback, useState } from 'react';
import { SafeAreaView, Text, View } from '@symbiote-native/react';
import { useFocusEffect, useIsFocused, useNavigationState } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Hooks demo: useFocusEffect increments a counter every time this screen (re)gains focus and logs
 * the moment it loses it; useIsFocused visibly renders the live true/false; useNavigationState
 * selects the whole route-name stack straight out of the root Stack's reducer state and renders
 * it as a list — navigate away and back (or push another screen) to watch all three update.
 */
export function HooksDemoScreen() {
  const [focusCount, setFocusCount] = useState(0);
  const [lastBlurAt, setLastBlurAt] = useState<number | undefined>(undefined);
  const isFocused = useIsFocused();
  const routeNames = useNavigationState(state => state.routes.map(route => route.name));
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HooksDemo];

  useFocusEffect(
    useCallback(() => {
      setFocusCount(count => count + 1);
      return () => setLastBlurAt(Date.now());
    }, []),
  );

  return (
    <SafeAreaView className="screen">
      <View className="section">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.introspection }}>
            <Text className="hero-badge-text">HK</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Hooks</Text>
            <Text className="hero-body">
              useFocusEffect, useIsFocused, and useNavigationState — introspecting the navigator's
              own live state from inside a screen.
            </Text>
          </View>
        </View>
        <Text testID="hooks-is-focused" className="info-text">{`useIsFocused(): ${isFocused}`}</Text>
        <Text testID="hooks-focus-count" className="info-text">{`useFocusEffect focus count: ${focusCount}`}</Text>
        <Text className="info-text">
          {lastBlurAt === undefined ? 'not blurred yet' : `last blurred at ${lastBlurAt}`}
        </Text>
        <Text className="section-label">useNavigationState() · current route stack</Text>
        {routeNames.map((name, index) => (
          <Text key={`${name}-${index}`} className="list-row-text">{`${index}. ${name}`}</Text>
        ))}
      </View>
    </SafeAreaView>
  );
}
