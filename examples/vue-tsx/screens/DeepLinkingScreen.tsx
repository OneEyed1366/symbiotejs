import { defineComponent, ref } from 'vue';
import { SafeAreaView, Text, TextInput, View } from '@symbiote-native/vue';
import { ActionButton } from '../components/ActionButton';
import { resolveRouteFromUrl } from '@symbiote-native/navigation';
import { APP_LINKING_CONFIG, SAMPLE_DEEP_LINK_URL } from '../navigation-linking';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
 * root via useLinkingIntegration (App.tsx) for real OS deep links — here resolveRouteFromUrl is
 * called directly against a typed-in URL so the resolution itself is provable inside the running
 * app without needing an actual OS-level deep link.
 */
export const DeepLinkingScreen = defineComponent(
  () => {
    const url = ref(SAMPLE_DEEP_LINK_URL);
    const resolved = ref<string | undefined>(undefined);

    const onResolve = (): void => {
      const route = resolveRouteFromUrl(APP_LINKING_CONFIG, url.value);
      resolved.value = JSON.stringify(route, null, 2);
    };

    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];

    return () => (
      <SafeAreaView class="screen">
        <View class="section">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.routing }}>
              <Text class="hero-badge-text">DL</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Deep linking</Text>
              <Text class="hero-body">
                A typed URL resolved to a route through resolveRouteFromUrl, the same path a real
                deep link or push notification would take.
              </Text>
            </View>
          </View>
          <Text class="info-text">
            prefixes: symbiotecanaryvuetsx:// · https://canary.symbiote-native.dev
          </Text>
          <Text class="note-text">Details → details/:id · HeaderOptions → header-options · TabsDemo → tabs</Text>
          <TextInput
            testID="deep-link-input"
            value={url.value}
            onValueChange={(text: string) => {
              url.value = text;
            }}
            placeholder="symbiotecanaryvuetsx://details/42"
            placeholderTextColor="#41506a"
            class="text-input"
          />
          <ActionButton testID="deep-link-resolve" title="Resolve" onPress={onResolve} color={LINE_COLOR.routing} />
          <View class="parity-list">
            <Text testID="deep-link-result" class="list-row-text">
              {resolved.value ?? 'tap Resolve to see the parsed route'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  },
  { name: 'DeepLinkingScreen' },
);
