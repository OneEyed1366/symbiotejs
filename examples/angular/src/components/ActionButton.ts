import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Pressable, Text } from '@symbiote-native/angular';

// Drop-in replacement for RN's stock <Button> (same title/color/testID surface, `press` as a real
// Angular @Output() instead of React's onPress callback prop — Angular's own idiom, see
// angular-adapter-events) — a bare Button renders as unstyled tinted text on iOS, visually
// indistinguishable from a body Text line, which was the single biggest source of "looks messy"
// across the demo app (2026-07 cohesion pass). One consistent bordered pill, tinted in the
// caller's own `color` exactly like Button already took, so every screen's per-feature
// color-coding (e.g. AnimatedDemo's JS-vs-native pairing) is preserved — only the chrome becomes
// consistent. Twin of ../../react/components/ActionButton.tsx.
@Component({
  selector: 'ActionButton',
  standalone: true,
  imports: [Pressable, Text],
  template: `
    <Pressable [testID]="testID" (press)="press.emit()" class="action-button" [style]="buttonStyle">
      <Text class="action-button-text" [style]="textStyle">{{ title }}</Text>
    </Pressable>
  `,
})
export class ActionButton {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) color!: string;
  @Input() testID?: string;
  @Output() readonly press = new EventEmitter<void>();

  get buttonStyle(): (state: { pressed: boolean }) => Record<string, unknown> {
    const color = this.color;
    return ({ pressed }) => ({ borderColor: color, opacity: pressed ? 0.6 : 1 });
  }

  get textStyle(): Record<string, unknown> {
    return { color: this.color };
  }
}
