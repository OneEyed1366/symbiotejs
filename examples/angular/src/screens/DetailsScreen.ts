import { Component } from '@angular/core';
import { SafeAreaView, Text, View } from '@symbiote-native/angular';
import { injectRoute, injectStackNavigation } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../components/ActionButton';
import { LINE_COLOR } from '../navigation-lines';

function openedFromLabel(params: unknown): string {
  return typeof params === 'object' && params !== null && 'openedFrom' in params
    ? String(params.openedFrom)
    : 'none';
}

// A second native screen, pushed onto the SAME RNSScreenStack the canary screen lives
// in — proves push/pop, the native header (title from options, back button/back-title),
// and route.params round-tripping through the navigator handle. Angular twin of
// ../../react/screens/DetailsScreen.tsx.
@Component({
  selector: 'DetailsScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <Text class="section-label">Navigation demo · Details screen</Text>
        <Text class="info-text">{{ 'route.params: ' + paramsLabel }}</Text>
        <Text class="info-text">{{ 'canGoBack: ' + navigation.canGoBack() }}</Text>
        <ActionButton
          testID="nav-pop"
          title="← Pop back"
          (press)="navigation.pop()"
          [color]="lineColorPrimitives"
        ></ActionButton>
      </View>
    </SafeAreaView>
  `,
})
export class DetailsScreen {
  readonly navigation = injectStackNavigation();
  private readonly route = injectRoute();

  readonly lineColorPrimitives = LINE_COLOR.primitives;

  get paramsLabel(): string {
    return openedFromLabel(this.route().params);
  }
}
