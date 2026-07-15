import { Component } from '@angular/core';
import { Pressable, SafeAreaView, Text, View } from '@symbiote-native/angular';
import {
  Drawer,
  DrawerScreenDirective,
  injectDrawerNavigation,
} from '@symbiote-native/navigation/angular';
import type { IDrawerContentContext } from '@symbiote-native/navigation/angular';
import type { IRoute } from '@symbiote-native/navigation';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

const drawerLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];
const drawerLineTagClass = `line-tag line-tag-${drawerLineInfo.line}`;
const drawerLineTagLabel = `${drawerLineInfo.code} · ${drawerLineInfo.label}`;

@Component({
  selector: 'DrawerHomeScreen',
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
            <Text class="hero-badge-text">DR</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Drawer</Text>
            <Text class="hero-body">
              A swipeable drawer sliding in from the right, driven by the navigator's own gesture
              handler.
            </Text>
          </View>
        </View>
        <Text class="info-text">
          drawerPosition: right · drawerType: slide — swipe from the RIGHT edge, or use a button
        </Text>
        <ActionButton
          testID="drawer-open"
          title="Open drawer"
          (press)="openDrawer()"
          [color]="lineColorStructure"
        ></ActionButton>
        <ActionButton
          testID="drawer-toggle"
          title="Toggle drawer"
          (press)="toggleDrawer()"
          [color]="lineColorStructure"
        ></ActionButton>
      </View>
    </SafeAreaView>
  `,
})
export class DrawerHomeScreen {
  private readonly navigation = injectDrawerNavigation();

  readonly lineTagClass = drawerLineTagClass;
  readonly lineTagLabel = drawerLineTagLabel;
  readonly lineColorStructure = LINE_COLOR.structure;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.structure };

  openDrawer(): void {
    this.navigation.openDrawer();
  }

  toggleDrawer(): void {
    this.navigation.toggleDrawer();
  }
}

@Component({
  selector: 'DrawerSettingsScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <Text class="section-label">Drawer demo · Settings</Text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          (press)="closeDrawer()"
          [color]="lineColorStructure"
        ></ActionButton>
      </View>
    </SafeAreaView>
  `,
})
export class DrawerSettingsScreen {
  private readonly navigation = injectDrawerNavigation();

  readonly lineTagClass = drawerLineTagClass;
  readonly lineTagLabel = drawerLineTagLabel;
  readonly lineColorStructure = LINE_COLOR.structure;

  closeDrawer(): void {
    this.navigation.closeDrawer();
  }
}

/**
 * Drawer demo: a swipeable Drawer navigator with 2 Drawer screens, a non-default
 * drawerPosition ('right') and drawerType ('slide') to prove those props actually flow through
 * to render-drawer.ts's geometry, plus imperative open/toggle/close buttons alongside the swipe
 * gesture. The `#drawerContent` template supplies the menu panel (Drawer ships no built-in one) —
 * Angular's own idiom for a caller-supplied template needing live data (TemplateRef +
 * NgTemplateOutlet with a context object), the twin of React's renderDrawerContent render-prop
 * callback (see drawer.ts's own header comment on this split). Angular twin of
 * ../../react/screens/DrawerDemoScreen.tsx.
 */
@Component({
  selector: 'DrawerDemoScreen',
  standalone: true,
  imports: [Drawer, DrawerScreenDirective, Pressable, SafeAreaView, Text],
  template: `
    <Drawer
      initialRouteName="Home"
      drawerPosition="right"
      drawerType="slide"
      [drawerStyle]="drawerPanelStyle"
    >
      <ng-template symbioteDrawerScreen name="Home" [component]="drawerHomeScreen" [options]="homeOptions"></ng-template>
      <ng-template symbioteDrawerScreen name="Settings" [component]="drawerSettingsScreen" [options]="settingsOptions"></ng-template>
      <ng-template #drawerContent let-ctx>
        <SafeAreaView testID="drawer-panel" class="section-tight drawer-panel">
          <Text class="section-label">Menu</Text>
          @for (route of ctx.state.routes; track route.key) {
            <Pressable
              [testID]="'drawer-menu-' + route.name"
              class="menu-row"
              (press)="ctx.navigation.jumpTo(route.name)"
            >
              <Text class="menu-row-label">{{ drawerLabelFor(ctx.descriptors, route) }}</Text>
            </Pressable>
          }
        </SafeAreaView>
      </ng-template>
    </Drawer>
  `,
})
export class DrawerDemoScreen {
  readonly drawerHomeScreen = DrawerHomeScreen;
  readonly drawerSettingsScreen = DrawerSettingsScreen;
  readonly homeOptions = { title: 'Home', drawerLabel: 'Home' };
  readonly settingsOptions = { title: 'Settings', drawerLabel: 'Settings' };
  readonly drawerPanelStyle = { backgroundColor: '#13243a' };

  drawerLabelFor(descriptors: IDrawerContentContext['$implicit']['descriptors'], route: IRoute<unknown>): string {
    return descriptors[route.key]?.options.drawerLabel ?? route.name;
  }
}
