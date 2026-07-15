import { Component } from '@angular/core';
import { ScrollView, Text, View } from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

// Registered on the root Stack's <ng-template symbioteScreen [options]="sheetDemoScreenOptions">
// (App.ts) — a plain options object is enough here (unlike headerOptionsScreenOptions's resolver)
// since none of these fields need the live navigation handle. Twin of
// ../../react/screens/SheetDemoScreen.tsx's sheetDemoScreenOptions — see that file's own comment
// for the full formSheet/RNSScreenContentWrapper rationale (framework-agnostic, unchanged here).
export const sheetDemoScreenOptions: IAngularScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  stackPresentation: 'formSheet',
  sheetAllowedDetents: [0.3, 0.6, 1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
  sheetInitialDetentIndex: 0,
};

/**
 * Sheet presentation demo: this screen is PUSHED with stackPresentation: 'formSheet' and three
 * sheetAllowedDetents (30% / 60% / full height) — drag the grabber between them. "Present" is the
 * Menu screen's push onto this route; "Dismiss" below is this route's own pop, both driving the
 * native sheet the same way a real app would toggle it from a button. Angular twin of
 * ../../react/screens/SheetDemoScreen.tsx — skips SafeAreaView on purpose, same reasoning as the
 * React screen (react-native-screens' formSheet content-sizing search only walks ScrollView's
 * direct native subviews).
 */
@Component({
  selector: 'SheetDemoScreen',
  standalone: true,
  imports: [ActionButton, ScrollView, Text, View],
  template: `
    <ScrollView class="screen" contentContainerStyle="section">
      <View [class]="lineTagClass">
        <Text class="line-tag-text">{{ lineTagLabel }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" [style]="heroBadgeStyle">
          <Text class="hero-badge-text">SH</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Sheet presentation</Text>
          <Text class="hero-body">
            Pushed with stackPresentation: formSheet and three detents — drag the grabber between
            30%, 60%, and full height.
          </Text>
        </View>
      </View>
      <Text class="info-text">
        stackPresentation: formSheet · detents 30% / 60% / 100% · drag the grabber
      </Text>
      <ActionButton
        testID="sheet-dismiss"
        title="Dismiss"
        (press)="navigation.pop()"
        [color]="lineColorPresentation"
      ></ActionButton>
    </ScrollView>
  `,
})
export class SheetDemoScreen {
  readonly navigation = injectStackNavigation();

  readonly lineColorPresentation = LINE_COLOR.presentation;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.presentation };

  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SheetDemo];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
}
