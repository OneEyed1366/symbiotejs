import { defineComponent, ref } from 'vue';
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { useFocusEffect, useIsFocused, useNavigationState } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Hooks demo: useFocusEffect increments a counter every time this screen (re)gains focus and logs
 * the moment it loses it; useIsFocused visibly renders the live true/false; useNavigationState
 * selects the whole route-name stack straight out of the root Stack's reducer state and renders
 * it as a list — navigate away and back (or push another screen) to watch all three update.
 */
export const HooksDemoScreen = defineComponent(
  () => {
    const focusCount = ref(0);
    const lastBlurAt = ref<number | undefined>(undefined);
    const isFocused = useIsFocused();
    const routeNames = useNavigationState(state => state.routes.map(route => route.name));
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HooksDemo];

    // Vue's setup() runs once, so `effect` needs no memoization (React.useCallback) the way the
    // React twin does — there is no dependency array to go stale here.
    useFocusEffect(() => {
      focusCount.value += 1;
      return () => {
        lastBlurAt.value = Date.now();
      };
    });

    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.introspection }}>
              <Text class="hero-badge-text">HK</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Hooks</Text>
              <Text class="hero-body">
                useFocusEffect, useIsFocused, and useNavigationState — introspecting the navigator's
                own live state from inside a screen.
              </Text>
            </View>
          </View>
          <Text testID="hooks-is-focused" class="info-text">{`useIsFocused(): ${isFocused.value}`}</Text>
          <Text testID="hooks-focus-count" class="info-text">{`useFocusEffect focus count: ${focusCount.value}`}</Text>
          <Text class="info-text">
            {lastBlurAt.value === undefined ? 'not blurred yet' : `last blurred at ${lastBlurAt.value}`}
          </Text>
          <Text class="section-label">useNavigationState() · current route stack</Text>
          {routeNames.value.map((name, index) => (
            <Text key={`${name}-${index}`} class="list-row-text">{`${index}. ${name}`}</Text>
          ))}
        </View>
      </SafeAreaView>
    );
  },
  { name: 'HooksDemoScreen' },
);
