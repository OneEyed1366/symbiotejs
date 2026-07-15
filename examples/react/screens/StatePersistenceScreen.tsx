import { useState } from 'react';
import { SafeAreaView, Text, View } from '@symbiote-native/react';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import { useNavigation, useNavigationState } from '@symbiote-native/navigation/react';
import type { INavigatorState } from '@symbiote-native/navigation';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * State persistence demo: "Serialize" reads the LIVE root Stack state via useNavigationState and
 * JSON.stringifies serializeNavigatorState's output for display; "Restore" parses that same JSON
 * back with deserializeNavigatorState (which validates the shape, no blind `as`) and hands it to
 * navigation.reset() — the round trip real @react-navigation persistence (initialState/
 * onStateChange) is built on. Restoring genuinely navigates: the stack becomes exactly the
 * serialized snapshot, which may move you away from this very screen.
 */
export function StatePersistenceScreen() {
  const navigation = useNavigation();
  const state = useNavigationState<INavigatorState>(currentState => currentState);
  const [snapshot, setSnapshot] = useState<string | undefined>(undefined);
  const [restoreError, setRestoreError] = useState<string | undefined>(undefined);

  const onSerialize = () => {
    setRestoreError(undefined);
    setSnapshot(JSON.stringify(serializeNavigatorState(state), null, 2));
  };

  const onRestore = () => {
    if (snapshot === undefined) return;
    if (!('reset' in navigation)) {
      setRestoreError('this screen is not mounted under a Stack — reset() is unavailable');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(snapshot);
      navigation.reset(deserializeNavigatorState(parsed));
      setRestoreError(undefined);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'restore failed');
    }
  };

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StatePersistence];

  return (
    <SafeAreaView className="screen">
      <View className="section">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.routing }}>
            <Text className="hero-badge-text">SP</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">State persistence</Text>
            <Text className="hero-body">
              The Stack's own state serialized out and deserialized back in — restoring exactly
              where you left off.
            </Text>
          </View>
        </View>
        <Text className="info-text">{`current stack depth: ${state.routes.length}`}</Text>
        <ActionButton
          testID="persist-serialize"
          title="Serialize current stack"
          onPress={onSerialize}
          color={LINE_COLOR.routing}
        />
        <ActionButton
          testID="persist-restore"
          title="Restore serialized snapshot"
          onPress={onRestore}
          color={LINE_COLOR.routing}
        />
        {restoreError !== undefined && <Text className="info-text">{`error: ${restoreError}`}</Text>}
        <View className="box-list160">
          <Text testID="persist-snapshot" className="list-row-text">
            {snapshot ?? 'tap Serialize to capture the current route stack as JSON'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
