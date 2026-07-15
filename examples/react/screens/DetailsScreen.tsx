import { SafeAreaView, Text, View } from '@symbiote-native/react';
import { useRoute, useStackNavigation } from '@symbiote-native/navigation/react';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

// A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives
// in — proves push/pop, the native header (title from options, back button/back-title),
// and route.params round-tripping through the navigator handle.
export function DetailsScreen() {
  const route = useRoute();
  const navigation = useStackNavigation();
  const params = route.params;
  const paramsLabel =
    typeof params === 'object' && params !== null && 'openedFrom' in params
      ? String(params.openedFrom)
      : 'none';
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <Text className="section-label">Navigation demo · Details screen</Text>
        <Text className="info-text">{`route.params: ${paramsLabel}`}</Text>
        <Text className="info-text">{`canGoBack: ${navigation.canGoBack()}`}</Text>
        <ActionButton
          testID="nav-pop"
          title="← Pop back"
          onPress={() => navigation.pop()}
          color={LINE_COLOR.primitives}
        />
      </View>
    </SafeAreaView>
  );
}
