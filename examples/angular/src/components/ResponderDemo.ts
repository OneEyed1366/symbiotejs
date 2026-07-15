import { Component } from '@angular/core';
import {
  SymbioteHostPropsDirective,
  Text,
  View,
  type ISymbioteEvent,
} from '@symbiote-native/angular';
// static look lives here, compiled at build time by @symbiote-native/css-parser
import './ResponderDemo.css';

const RESPONDER_CHIPS = [0, 1, 2, 3, 4];
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64;

function firstTouchX(event: ISymbioteEvent): number {
  const touches = event.nativeEvent.touches;
  if (!Array.isArray(touches) || touches.length === 0) return 0;
  const first: unknown = touches[0];
  if (typeof first === 'object' && first !== null && 'pageX' in first) {
    const pageX = first.pageX;
    return typeof pageX === 'number' ? pageX : 0;
  }
  return 0;
}

// One chip's responder handlers, pre-bound to its index and bundled into a single `hostProps` bag
// so the template never allocates a fresh closure per change-detection pass.
interface IChipHandlers {
  index: number;
  hostProps: Record<string, unknown>;
}

// View's own primitive host only declares `style` as a real Angular @Input() (see
// adapters/angular/src/primitives/shared.ts) — the responder-negotiation callbacks below are NOT
// declared Inputs, so a bound `[onFoo]="…"` on a bare View fails Angular's real strictTemplates
// build (NG8002, `examples/angular/tsconfig.angular.json` has `strictTemplates: true`) even though
// it works at runtime via the engine's generic prop router. The established fix (see
// adapters/angular/src/components/pressable/index.ts's `[symbioteHostProps]` usage) is to bundle
// such props into one object and bind it through `[symbioteHostProps]`, a REAL declared @Input.
@Component({
  selector: 'ResponderDemo',
  standalone: true,
  imports: [View, Text, SymbioteHostPropsDirective],
  template: `
    <View class="section-tight">
      <Text class="section-label"
        >Responder · drag a chip vs hand-off to the strip</Text
      >
      <Text testID="resp-status" class="info-text">{{ status }}</Text>
      <Text
        testID="resp-transfer"
        class="transfer-text"
        [style]="{ color: transfer ? '#f6ad55' : '#41506a' }"
        >{{ transfer || 'transfer: —' }}</Text
      >
      <View [symbioteHostProps]="stripHostProps" class="strip-box">
        <View
          class="row-tight"
          [style]="{ transform: [{ translateX: rowDx }] }"
        >
          @for (chip of chipHandlers; track chip.index) {
            <View
              [symbioteHostProps]="chip.hostProps"
              class="chip"
              [style]="{
                borderColor:
                  activeChip === chip.index ? '#dd0031' : 'transparent',
                transform: [
                  { translateX: activeChip === chip.index ? chipDx : 0 },
                ],
              }"
            >
              <Text class="chip-text">{{ chip.index }}</Text>
            </View>
          }
        </View>
      </View>
    </View>
  `,
})
export class ResponderDemo {
  activeChip: number | null = null;
  chipDx = 0;
  rowDx = 0;
  status = 'tap a chip · drag it to move · drag far → strip steals it';
  transfer = '';
  private startX = 0;
  private panStartX = 0;
  private grabbed: number | null = null;

  readonly chipHandlers: IChipHandlers[] = RESPONDER_CHIPS.map(index => {
    const onStartShouldSetResponder = (): boolean => true;
    const onResponderGrant = (event: ISymbioteEvent): void => {
      this.startX = firstTouchX(event);
      this.grabbed = index;
      this.activeChip = index;
      this.chipDx = 0;
      this.rowDx = 0;
      this.transfer = '';
      this.status = `chip ${index} grabbed`;
    };
    const onResponderMove = (event: ISymbioteEvent): void => {
      const dx = firstTouchX(event) - this.startX;
      this.chipDx = dx;
      this.status = `chip ${index} moving · dx=${Math.round(dx)}`;
    };
    const onResponderTerminationRequest = (): boolean => true;
    const onResponderTerminate = (): void => {
      this.chipDx = 0;
      this.activeChip = null;
    };
    const onResponderRelease = (): void => {
      this.chipDx = 0;
      this.activeChip = null;
      this.status = `chip ${index} released`;
    };
    return {
      index,
      hostProps: {
        // testID isn't a declared @Input() on View either, and unlike a static string literal
        // (testID="…"), a bracket-bound [testID] fails NG8002 the same way the responder props
        // do — so it rides in the same symbioteHostProps bag rather than its own binding.
        testID: `resp-chip-${index}`,
        onStartShouldSetResponder,
        onResponderGrant,
        onResponderMove,
        onResponderTerminationRequest,
        onResponderTerminate,
        onResponderRelease,
      },
    };
  });

  // Claims the gesture only once the finger has travelled past the threshold, stealing
  // it from whichever chip currently holds it, the transfer path.
  private readonly onStripMoveShouldSet = (event: ISymbioteEvent): boolean =>
    this.grabbed !== null &&
    Math.abs(firstTouchX(event) - this.startX) > RESPONDER_STEAL_DX;

  private readonly onStripGrant = (event: ISymbioteEvent): void => {
    this.transfer = `↯ strip stole the gesture from chip ${this.grabbed ?? '?'}`;
    this.activeChip = null;
    this.chipDx = 0;
    this.panStartX = firstTouchX(event);
    this.status = 'strip panning';
  };

  private readonly onStripMove = (event: ISymbioteEvent): void => {
    this.rowDx = firstTouchX(event) - this.panStartX;
  };

  private readonly onStripRelease = (): void => {
    this.rowDx = 0;
    this.status = 'strip released';
  };

  private readonly onStripTerminate = (): void => {
    this.rowDx = 0;
  };

  readonly stripHostProps = {
    // testID isn't a declared @Input() on View either — same symbioteHostProps bag as the
    // per-chip hostProps above.
    testID: 'resp-strip',
    onMoveShouldSetResponder: this.onStripMoveShouldSet,
    onResponderGrant: this.onStripGrant,
    onResponderMove: this.onStripMove,
    onResponderRelease: this.onStripRelease,
    onResponderTerminate: this.onStripTerminate,
  };
}
