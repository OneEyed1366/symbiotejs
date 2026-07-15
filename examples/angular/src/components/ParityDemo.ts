import { Component, ViewChild } from '@angular/core';
import {
  AccessibilityInfo,
  Button,
  FlatList,
  Keyboard,
  SectionList,
  SymbioteHostPropsDirective,
  Text,
  TextInput,
  View,
  VListItemDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  type ISection,
} from '@symbiote-native/angular';
// static look compiled at build time by @symbiote-native/css-parser
import './ParityDemo.css';

// Verification panel for five feature-parity behaviors: Text.onLongPress synthesis,
// Keyboard.dismiss (blur the focused input), animated VirtualizedList scroll, sticky
// SectionList headers, and node-based accessibility focus. The Angular twin of
// examples/vue-sfc/components/ParityDemo.vue and the reference React ParityDemo section.
//
// FlatList/SectionList take their cell content as `<ng-template vListItem>` /
// `vSectionHeader` / `vSectionItem` (Angular's template idiom for the element-returning
// renderItem family — see adapters/angular/src/components/flat-list/index.ts and
// section-list/index.ts), not a renderItem prop.

const PARITY_ROW_H = 30;

interface IParityRow {
  id: string;
  n: number;
}

const parityRows: IParityRow[] = Array.from({ length: 30 }, (_unused, index) => ({
  id: `pr-${index}`,
  n: index,
}));

interface ISectionEntry {
  id: string;
  label: string;
}

// Tall sections (taller than the list viewport) so the sticky cross-talk is visible: as you
// scroll, the next section header should reach the top and push the pinned one off.
function sectionData(prefix: string, label: string): ISectionEntry[] {
  return Array.from({ length: 8 }, (_unused, index) => ({
    id: `${prefix}${index}`,
    label: `${label} ${index}`,
  }));
}

const paritySections: ISection<ISectionEntry>[] = [
  { title: 'Fruit', data: sectionData('f', 'apple') },
  { title: 'Tools', data: sectionData('t', 'hammer') },
  { title: 'Cities', data: sectionData('c', 'porto') },
];

@Component({
  selector: 'ParityDemo',
  standalone: true,
  imports: [
    View,
    Text,
    Button,
    TextInput,
    FlatList,
    SectionList,
    VListItemDirective,
    VSectionHeaderDirective,
    VSectionItemDirective,
    SymbioteHostPropsDirective,
  ],
  template: `
    <View class="section">
      <Text #titleRef class="section-label"
        >Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus</Text
      >

      <!-- Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap. Text's own
           primitive host only declares 'style' as a real @Input() (adapters/angular/src/primitives/
           shared.ts), so onLongPress/onPress bind through the symbioteHostProps bag (a REAL declared
           @Input), not as [onLongPress]/[onPress] directly — see ResponderDemo.ts for the same fix. -->
      <Text [symbioteHostProps]="longPressHostProps" class="long-press-row"
        >{{ longPressMsg }}</Text
      >

      <!-- Keyboard.dismiss: blurs whatever input holds focus without needing a ref -->
      <TextInput
        testID="focus-input"
        placeholder="focus me…"
        placeholderTextColor="#41506a"
        (focus)="handleFocus()"
        (blur)="handleBlur()"
        class="focus-input"
      />
      <Text testID="dismiss-msg" class="note-text">{{ dismissMsg }}</Text>
      <Button
        testID="hide-keyboard-btn"
        title="Hide keyboard"
        (press)="hideKeyboard()"
        color="#dd0031"
      ></Button>

      <!-- animated VirtualizedList scroll: smooth vs instant -->
      <Text class="section-label">FlatList · animated scrollToOffset</Text>
      <FlatList
        testID="parity-flat-list"
        [data]="parityRows"
        [keyExtractor]="parityKeyExtractor"
        [getItemLayout]="parityItemLayout"
        class="parity-list"
      >
        <ng-template vListItem let-item>
          <View class="parity-row">
            <Text class="info-text">{{ 'row ' + parityRowNumber(item) }}</Text>
          </View>
        </ng-template>
      </FlatList>
      <View class="row">
        <View class="flex-1">
          <Button
            testID="scroll-down-animated-btn"
            title="Scroll ▼ animated"
            (press)="scrollDown()"
            color="#dd0031"
          ></Button>
        </View>
        <View class="flex-1">
          <Button
            testID="scroll-top-btn"
            title="Top · instant"
            (press)="scrollTop()"
            color="#dd0031"
          ></Button>
        </View>
      </View>

      <!-- sticky section headers: drag the inner list, each header pins at the top -->
      <Text class="section-label"
        >SectionList · sticky (scroll: next header should push prev off)</Text
      >
      <SectionList
        testID="sticky-section-list"
        [sections]="paritySections"
        [keyExtractor]="sectionKeyExtractor"
        [stickySectionHeadersEnabled]="true"
        class="section-list"
      >
        <ng-template vSectionHeader let-section>
          <Text class="section-header">{{ section.title }}</Text>
        </ng-template>
        <ng-template vSectionItem let-item>
          <View class="parity-row">
            <Text class="info-text">{{ sectionItemLabel(item) }}</Text>
          </View>
        </ng-template>
      </SectionList>

      <!-- a11y focus: node-based sendAccessibilityEvent routes through the Fabric slot on both platforms -->
      <Button
        testID="focus-title-btn"
        title="Focus the panel title (a11y)"
        (press)="focusTitle()"
        color="#dd0031"
      ></Button>
    </View>
  `,
})
export class ParityDemo {
  @ViewChild('titleRef') private titleRef?: Text;
  @ViewChild(FlatList) private listRef?: FlatList<IParityRow>;

  readonly parityRows = parityRows;
  readonly paritySections = paritySections;

  longPressMsg = 'long-press or tap the row below';
  dismissMsg = 'focus the field, then Hide keyboard';

  readonly handleLongPress = (): void => {
    this.longPressMsg = 'long press! (tap was suppressed)';
  };

  readonly handleTap = (): void => {
    this.longPressMsg = 'tap';
  };

  readonly longPressHostProps = {
    // testID isn't a declared @Input() on Text either — see ResponderDemo.ts's chip
    // hostProps for the same bag pattern.
    testID: 'long-press-row',
    onLongPress: this.handleLongPress,
    onPress: this.handleTap,
  };

  readonly handleFocus = (): void => {
    this.dismissMsg = 'keyboard up — tap Hide keyboard';
  };

  readonly handleBlur = (): void => {
    this.dismissMsg = 'blurred (keyboard down)';
  };

  readonly hideKeyboard = (): void => {
    Keyboard.dismiss();
  };

  readonly scrollDown = (): void => {
    this.listRef?.scrollToOffset({ offset: 20 * PARITY_ROW_H, animated: true });
  };

  readonly scrollTop = (): void => {
    this.listRef?.scrollToOffset({ offset: 0, animated: false });
  };

  readonly focusTitle = (): void => {
    const title = this.titleRef?.nativeElement;
    if (title !== undefined) {
      AccessibilityInfo.sendAccessibilityEvent(title, 'focus');
    }
  };

  readonly parityKeyExtractor = (item: IParityRow): string => item.id;

  readonly parityItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: PARITY_ROW_H,
    offset: PARITY_ROW_H * index,
    index,
  });

  readonly sectionKeyExtractor = (item: ISectionEntry): string => item.id;

  // vListItem/vSectionItem template contexts type `let-item` as `unknown` (same as App.ts's own
  // chips FlatList — see isChip/chipColor there), so cell templates narrow through a guard rather
  // than accessing the field directly.
  readonly parityRowNumber = (item: unknown): number | string =>
    this.isParityRow(item) ? item.n : '?';

  readonly sectionItemLabel = (item: unknown): string =>
    this.isSectionEntry(item) ? item.label : '';

  private isParityRow(item: unknown): item is IParityRow {
    return (
      typeof item === 'object' &&
      item !== null &&
      'n' in item &&
      typeof item.n === 'number'
    );
  }

  private isSectionEntry(item: unknown): item is ISectionEntry {
    return (
      typeof item === 'object' &&
      item !== null &&
      'label' in item &&
      typeof item.label === 'string'
    );
  }
}
