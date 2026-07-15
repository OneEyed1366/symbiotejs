import { Component, type Signal } from '@angular/core';
import { SafeAreaView, Text, View } from '@symbiote-native/angular';
import { Tab, TabScreenDirective, injectIsFocused } from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const tabsLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];
const tabLineTagClass = `line-tag line-tag-${tabsLineInfo.line}`;
const tabLineTagLabel = `${tabsLineInfo.code} · ${tabsLineInfo.label}`;

@Component({
  selector: 'TabHomeScreen',
  standalone: true,
  imports: [SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">TB</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Tabs</Text>
            <Text class="hero-body">
              A bottom-tabs navigator — icon, badge, and tint, each tab a real native view.
            </Text>
          </View>
        </View>
        <Text class="info-text">{{ 'focused: ' + isFocused() }}</Text>
      </View>
    </SafeAreaView>
  `,
})
export class TabHomeScreen {
  readonly lineTagClass = tabLineTagClass;
  readonly lineTagLabel = tabLineTagLabel;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.structure };
  readonly isFocused: Signal<boolean>;

  constructor() {
    this.isFocused = injectIsFocused();
  }
}

@Component({
  selector: 'TabSearchScreen',
  standalone: true,
  imports: [SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <Text class="section-label">Search tab</Text>
        <Text class="info-text">{{ 'focused: ' + isFocused() }}</Text>
      </View>
    </SafeAreaView>
  `,
})
export class TabSearchScreen {
  readonly lineTagClass = tabLineTagClass;
  readonly lineTagLabel = tabLineTagLabel;
  readonly isFocused: Signal<boolean>;

  constructor() {
    this.isFocused = injectIsFocused();
  }
}

@Component({
  selector: 'TabProfileScreen',
  standalone: true,
  imports: [SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <Text class="section-label">Profile tab</Text>
        <Text class="info-text">{{ 'focused: ' + isFocused() }}</Text>
      </View>
    </SafeAreaView>
  `,
})
export class TabProfileScreen {
  readonly lineTagClass = tabLineTagClass;
  readonly lineTagLabel = tabLineTagLabel;
  readonly isFocused: Signal<boolean>;

  constructor() {
    this.isFocused = injectIsFocused();
  }
}

/**
 * Tabs demo: a bottom-tabs Tab navigator with 3 Tab screens. Home gets a custom tabBarIcon +
 * tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
 * tint/no-icon look side by side with the customized tabs. Angular twin of
 * ../../react/screens/TabsDemoScreen.tsx.
 */
@Component({
  selector: 'TabsDemoScreen',
  standalone: true,
  imports: [Tab, TabScreenDirective],
  template: `
    <Tab initialRouteName="Home">
      <ng-template symbioteTabScreen name="Home" [component]="tabHomeScreen" [options]="homeOptions"></ng-template>
      <ng-template symbioteTabScreen name="Search" [component]="tabSearchScreen" [options]="searchOptions"></ng-template>
      <ng-template symbioteTabScreen name="Profile" [component]="tabProfileScreen" [options]="profileOptions"></ng-template>
    </Tab>
  `,
})
export class TabsDemoScreen {
  readonly tabHomeScreen = TabHomeScreen;
  readonly tabSearchScreen = TabSearchScreen;
  readonly tabProfileScreen = TabProfileScreen;

  readonly homeOptions = {
    tabBarLabel: 'Home',
    tabBarIcon: '🏠',
    tabBarActiveTintColor: LINE_COLOR.structure,
  };
  readonly searchOptions = { tabBarLabel: 'Search', tabBarIcon: '🔍', tabBarBadge: 3 };
  readonly profileOptions = { tabBarLabel: 'Profile', tabBarIcon: '👤' };
}
