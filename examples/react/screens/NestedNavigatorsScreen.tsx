import { SafeAreaView, Text, View } from '@symbiote-native/react';
import { Tab, useNavigation } from '@symbiote-native/navigation/react';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const nestedLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];

function NestedTabHomeScreen() {
  // This Tab is rendered AS the content of a root-Stack screen (NestedNavigatorsScreen below), so
  // useNavigation() here resolves to the nested Tab's OWN handle, while getParent() walks exactly
  // one hop up the NavigationContext chain to reach the ENCLOSING Stack's handle.
  const navigation = useNavigation();
  const parent = navigation.getParent();
  const canPopParent = parent !== undefined && 'pop' in parent;
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <View className={`line-tag line-tag-${nestedLineInfo.line}`}>
          <Text className="line-tag-text">{`${nestedLineInfo.code} · ${nestedLineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.structure }}>
            <Text className="hero-badge-text">NN</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Nested navigators</Text>
            <Text className="hero-body">
              A Tab navigator nested inside a Stack screen, reaching its parent's own navigation
              handle through getParent().
            </Text>
          </View>
        </View>
        <Text className="info-text">
          {`parent navigator reachable via getParent(): ${canPopParent ? 'yes (Stack)' : 'no'}`}
        </Text>
        <ActionButton
          testID="nested-pop-parent"
          title="Pop parent Stack (via getParent)"
          onPress={() => {
            if (parent !== undefined && 'pop' in parent) parent.pop();
          }}
          color={LINE_COLOR.structure}
        />
      </View>
    </SafeAreaView>
  );
}

function NestedTabInfoScreen() {
  return (
    <SafeAreaView className="screen">
      <View className="section">
        <View className={`line-tag line-tag-${nestedLineInfo.line}`}>
          <Text className="line-tag-text">{`${nestedLineInfo.code} · ${nestedLineInfo.label}`}</Text>
        </View>
        <Text className="section-label">Nested Tab · Info</Text>
        <Text className="info-text">A second tab, proving the nested Tab bar switches focus normally.</Text>
      </View>
    </SafeAreaView>
  );
}

/**
 * Nested navigators demo: THIS screen's content is a whole Tab navigator (not a plain View),
 * proving a navigator can be nested inside another navigator's screen. NestedTabHomeScreen's
 * "Pop parent Stack" button proves useNavigation().getParent() reaches back through the Tab's
 * own context to the enclosing root Stack and can drive it (pop this very screen off).
 */
export function NestedNavigatorsScreen() {
  return (
    <Tab initialRouteName="NestedHome">
      <Tab.Screen name="NestedHome" component={NestedTabHomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="NestedInfo" component={NestedTabInfoScreen} options={{ tabBarLabel: 'Info' }} />
    </Tab>
  );
}
