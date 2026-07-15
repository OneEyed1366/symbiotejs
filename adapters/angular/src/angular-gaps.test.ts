/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string): string => readFileSync(path, 'utf8');

describe('Angular adapter gap regressions', () => {
  it('VirtualizedList exposes accessibility and aria inputs and forwards them to ScrollView', () => {
    const source = readSource('adapters/angular/src/components/virtualized-list/index.ts');

    expect(source).toContain('@Input() accessibilityLabel?: string');
    expect(source).toContain('@Input() ariaBusy?: boolean');
    expect(source).toContain('[accessibilityLabel]="foldedAccessibility.accessibilityLabel"');
    expect(source).toContain('[accessibilityState]="foldedAccessibility.accessibilityState"');
    expect(source).toContain('[accessibilityRole]="foldedAccessibility.accessibilityRole"');
  });

  it('Animated namespace exposes AOT-safe built-in entries and documents runtime HOC as a non-goal', () => {
    const animatedSource = readSource('adapters/angular/src/modules/animated/index.ts');
    const componentSource = readSource(
      'adapters/angular/src/modules/animated/create-animated-component.ts',
    );

    expect(componentSource).toContain('export const AnimatedFlatList');
    expect(componentSource).toContain('export const AnimatedSectionList');
    expect(componentSource).toContain('if (base === View) return AnimatedView');
    expect(componentSource).toContain('if (base === Text) return AnimatedText');
    expect(componentSource).toContain('if (base === Image) return AnimatedImage');
    expect(componentSource).toContain('if (base === ScrollView) return AnimatedScrollView');
    expect(componentSource).toContain('Angular cannot synthesize a component at runtime');
    expect(componentSource).toContain('no JIT under AOT/Metro');
    expect(componentSource).toContain(
      'Author an explicit standalone @Component extending AnimatedComponentBase',
    );
    expect(animatedSource).toContain('View: AnimatedView');
    expect(animatedSource).toContain('Text: AnimatedText');
    expect(animatedSource).toContain('Image: AnimatedImage');
    expect(animatedSource).toContain('ScrollView: AnimatedScrollView');
    expect(animatedSource).toContain('FlatList: AnimatedFlatList');
    expect(animatedSource).toContain('SectionList: AnimatedSectionList');
  });

  it('AnimatedImage uses composed Image props and normalized load events', () => {
    const source = readSource('adapters/angular/src/modules/animated/create-animated-component.ts');

    expect(source).toContain('export class AnimatedImage extends ImageBase');
    expect(source).toContain('inputs: ANIMATED_IMAGE_INPUTS');
    expect(source).toContain('outputs: IMAGE_OUTPUTS');
    expect(source).toContain('const resolved = resolveImageProps(reduced)');
    expect(source).toContain('(load)="handleLoad($event)"');
    expect(source).toContain('(error)="handleError($event)"');
  });

  it('Image prop resolution is shared with AnimatedImage', () => {
    const imageSource = readSource('adapters/angular/src/components/image/shared.ts');

    expect(imageSource).toContain('export function resolveImageProps');
    expect(imageSource).toContain('get imageProps(): Record<string, unknown>');
    expect(imageSource).toContain('return resolveImageProps(this.imageInputProps)');
  });

  it('Button forwards its full accessibility and TV-focus surface through TouchableOpacity', () => {
    const buttonSource = readSource('adapters/angular/src/components/button.ts');
    const touchableSource = readSource('adapters/angular/src/components/touchable/index.ts');
    const pressableSource = readSource('adapters/angular/src/components/pressable/index.ts');

    for (const binding of [
      '[accessible]="true"',
      '[accessibilityLabelledBy]="accessibilityLabelledBy"',
      '[importantForAccessibility]="importantForAccessibility"',
      '[accessibilityLiveRegion]="accessibilityLiveRegion"',
      '[screenReaderFocusable]="screenReaderFocusable"',
      '[accessibilityViewIsModal]="accessibilityViewIsModal"',
      '[accessibilityElementsHidden]="accessibilityElementsHidden"',
      '[accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"',
      '[accessibilityLanguage]="accessibilityLanguage"',
      '[accessibilityRespondsToUserInteraction]="accessibilityRespondsToUserInteraction"',
      '[accessibilityShowsLargeContentViewer]="accessibilityShowsLargeContentViewer"',
      '[accessibilityLargeContentTitle]="accessibilityLargeContentTitle"',
      '(accessibilityAction)="accessibilityAction.emit($event)"',
      '(accessibilityTap)="accessibilityTap.emit($event)"',
      '(magicTap)="magicTap.emit($event)"',
      '(accessibilityEscape)="accessibilityEscape.emit($event)"',
      '[ariaModal]="ariaModal"',
      '[ariaValueMax]="ariaValueMax"',
      '[ariaValueMin]="ariaValueMin"',
      '[ariaValueNow]="ariaValueNow"',
      '[ariaValueText]="ariaValueText"',
      '[hasTVPreferredFocus]="hasTVPreferredFocus"',
      '[nextFocusDown]="nextFocusDown"',
      '[nextFocusForward]="nextFocusForward"',
      '[nextFocusLeft]="nextFocusLeft"',
      '[nextFocusRight]="nextFocusRight"',
      '[nextFocusUp]="nextFocusUp"',
    ]) {
      expect(buttonSource).toContain(binding);
    }

    for (const binding of [
      '[accessible]="accessible"',
      '[accessibilityLabelledBy]="accessibilityLabelledBy"',
      '[importantForAccessibility]="importantForAccessibility"',
      '[accessibilityLiveRegion]="accessibilityLiveRegion"',
      '[screenReaderFocusable]="screenReaderFocusable"',
      '[accessibilityViewIsModal]="accessibilityViewIsModal"',
      '[accessibilityElementsHidden]="accessibilityElementsHidden"',
      '[accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"',
      '[accessibilityLanguage]="accessibilityLanguage"',
      '[accessibilityRespondsToUserInteraction]="accessibilityRespondsToUserInteraction"',
      '[accessibilityShowsLargeContentViewer]="accessibilityShowsLargeContentViewer"',
      '[accessibilityLargeContentTitle]="accessibilityLargeContentTitle"',
      '(accessibilityAction)="accessibilityAction.emit($event)"',
      '(accessibilityTap)="accessibilityTap.emit($event)"',
      '(magicTap)="magicTap.emit($event)"',
      '(accessibilityEscape)="accessibilityEscape.emit($event)"',
      '[ariaModal]="ariaModal"',
      '[ariaValueMax]="ariaValueMax"',
      '[ariaValueMin]="ariaValueMin"',
      '[ariaValueNow]="ariaValueNow"',
      '[ariaValueText]="ariaValueText"',
      '[hasTVPreferredFocus]="hasTVPreferredFocus"',
      '[nextFocusDown]="nextFocusDown"',
      '[nextFocusForward]="nextFocusForward"',
      '[nextFocusLeft]="nextFocusLeft"',
      '[nextFocusRight]="nextFocusRight"',
      '[nextFocusUp]="nextFocusUp"',
    ]) {
      expect(touchableSource).toContain(binding);
    }

    // Pressable forwards its resolved props through the shared SymbioteHostPropsDirective
    // (adapters/angular/src/primitives/shared.ts) rather than one `[prop]="x"` binding per
    // key, so the contract to check is: the binding exists, and the `hostProps` getter it
    // reads from actually assembles `accessible` / the folded accessibility bag / TV-focus.
    expect(pressableSource).toContain('[symbioteHostProps]="hostProps"');
    expect(pressableSource).toContain('accessible: this.accessible');
    expect(pressableSource).toContain('...this.foldedAccessibility');
    expect(pressableSource).toContain('hasTVPreferredFocus: this.hasTVPreferredFocus');
    expect(pressableSource).toContain('(accessibilityAction)="emit(accessibilityAction, $event)"');
  });
});
