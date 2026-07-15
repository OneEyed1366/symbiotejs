import { Component, signal } from '@angular/core';
import { SafeAreaView, Text, TextInput, View } from '@symbiote-native/angular';
import { resolveRouteFromUrl } from '@symbiote-native/navigation';
import { ActionButton } from '../components/ActionButton';
import { APP_LINKING_CONFIG, SAMPLE_DEEP_LINK_URL } from '../navigation-linking';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Deep-linking demo: APP_LINKING_CONFIG (navigation-linking.ts) is the SAME config wired at the
 * root via injectLinkingIntegration (App.ts) for real OS deep links — here resolveRouteFromUrl is
 * called directly against a typed-in URL so the resolution itself is provable inside the running
 * app without needing an actual OS-level deep link. Angular twin of
 * ../../react/screens/DeepLinkingScreen.tsx.
 */
@Component({
  selector: 'DeepLinkingScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, Text, TextInput, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
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
          prefixes: symbiotecanaryangular:// · https://canary-angular.symbiote-native.dev
        </Text>
        <Text class="note-text">Details → details/:id · HeaderOptions → header-options · TabsDemo → tabs</Text>
        <TextInput
          testID="deep-link-input"
          [(value)]="url"
          placeholder="symbiotecanaryangular://details/42"
          placeholderTextColor="#41506a"
          class="text-input"
        />
        <ActionButton testID="deep-link-resolve" title="Resolve" (press)="onResolve()" [color]="lineColorRouting"></ActionButton>
        <View class="parity-list">
          <Text testID="deep-link-result" class="list-row-text">{{ resultText() }}</Text>
        </View>
      </View>
    </SafeAreaView>
  `,
})
export class DeepLinkingScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DeepLinking];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly lineColorRouting = LINE_COLOR.routing;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.routing };

  url = SAMPLE_DEEP_LINK_URL;
  private readonly resolved = signal<string | undefined>(undefined);

  onResolve(): void {
    const resolvedRoute = resolveRouteFromUrl(APP_LINKING_CONFIG, this.url);
    this.resolved.set(JSON.stringify(resolvedRoute, null, 2));
  }

  resultText(): string {
    return this.resolved() ?? 'tap Resolve to see the parsed route';
  }
}
