import { defineComponent } from 'vue';
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { useRoute, useStackNavigation } from '@symbiote-native/navigation/vue';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

// A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives
// in — proves push/pop, the native header (title from options, back button/back-title),
// and route.params round-tripping through the navigator handle. Only ever mounted under a
// Stack, so useStackNavigation() hands back the Stack handle directly; useRoute() reads the route.
export const DetailsScreen = defineComponent(
  () => {
    const route = useRoute();
    const navigation = useStackNavigation();
    return () => {
      const params = route.value.params;
      const paramsLabel =
        typeof params === 'object' && params !== null && 'openedFrom' in params
          ? String(params.openedFrom)
          : 'none';
      return (
        <SafeAreaView class="screen">
          <View class="section">
            <Text class="section-label">Navigation demo · Details screen</Text>
            <Text class="info-text">{`route.params: ${paramsLabel}`}</Text>
            <Text class="info-text">{`canGoBack: ${navigation.value.canGoBack()}`}</Text>
            <ActionButton
              testID="nav-pop"
              title="← Pop back"
              onPress={() => navigation.value.pop()}
              color={LINE_COLOR.primitives}
            />
          </View>
        </SafeAreaView>
      );
    };
  },
  { name: 'DetailsScreen' },
);
