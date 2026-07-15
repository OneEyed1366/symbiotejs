import { Component } from '@angular/core';
import { SafeAreaView, Text, View } from '@symbiote-native/angular';
import { Tab, TabScreenDirective, injectNavigation } from '@symbiote-native/navigation/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const nestedLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];
const nestedLineTagClass = `line-tag line-tag-${nestedLineInfo.line}`;
const nestedLineTagLabel = `${nestedLineInfo.code} · ${nestedLineInfo.label}`;

function canPop(handle: unknown): handle is { pop: () => void } {
  return typeof handle === 'object' && handle !== null && 'pop' in handle;
}

@Component({
  selector: 'NestedTabHomeScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">NN</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Nested navigators</Text>
            <Text class="hero-body">
              A Tab navigator nested inside a Stack screen, reaching its parent's own navigation
              handle through getParent().
            </Text>
          </View>
        </View>
        <Text class="info-text">
          {{ 'parent navigator reachable via getParent(): ' + (canPopParent ? 'yes (Stack)' : 'no') }}
        </Text>
        <ActionButton
          testID="nested-pop-parent"
          title="Pop parent Stack (via getParent)"
          (press)="popParent()"
          [color]="lineColorStructure"
        ></ActionButton>
      </View>
    </SafeAreaView>
  `,
})
export class NestedTabHomeScreen {
  readonly lineTagClass = nestedLineTagClass;
  readonly lineTagLabel = nestedLineTagLabel;
  readonly lineColorStructure = LINE_COLOR.structure;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.structure };

  // This Tab is rendered AS the content of a root-Stack screen (NestedNavigatorsScreen below), so
  // injectNavigation() here resolves to the nested Tab's OWN handle, while getParent() walks exactly
  // one hop up NavigationContextService's chain to reach the ENCLOSING Stack's handle.
  private readonly parent: unknown;
  readonly canPopParent: boolean;

  constructor() {
    const parent = injectNavigation().getParent();
    this.parent = parent;
    this.canPopParent = canPop(parent);
  }

  popParent(): void {
    if (canPop(this.parent)) this.parent.pop();
  }
}

@Component({
  selector: 'NestedTabInfoScreen',
  standalone: true,
  imports: [SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <Text class="section-label">Nested Tab · Info</Text>
        <Text class="info-text">A second tab, proving the nested Tab bar switches focus normally.</Text>
      </View>
    </SafeAreaView>
  `,
})
export class NestedTabInfoScreen {
  readonly lineTagClass = nestedLineTagClass;
  readonly lineTagLabel = nestedLineTagLabel;
}

/**
 * Nested navigators demo: THIS screen's content is a whole Tab navigator (not a plain View),
 * proving a navigator can be nested inside another navigator's screen. NestedTabHomeScreen's
 * "Pop parent Stack" button proves injectNavigation().getParent() reaches back through the Tab's
 * own NavigationContextService chain to the enclosing root Stack and can drive it (pop this very
 * screen off). Angular twin of ../../react/screens/NestedNavigatorsScreen.tsx.
 */
@Component({
  selector: 'NestedNavigatorsScreen',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab initialRouteName="NestedHome">
      <ng-template symbioteTabScreen name="NestedHome" [component]="nestedTabHomeScreen" [options]="homeOptions"></ng-template>
      <ng-template symbioteTabScreen name="NestedInfo" [component]="nestedTabInfoScreen" [options]="infoOptions"></ng-template>
    </Tab>
  `,
})
export class NestedNavigatorsScreen {
  readonly nestedTabHomeScreen = NestedTabHomeScreen;
  readonly nestedTabInfoScreen = NestedTabInfoScreen;
  readonly homeOptions = { tabBarLabel: 'Home' };
  readonly infoOptions = { tabBarLabel: 'Info' };
}
