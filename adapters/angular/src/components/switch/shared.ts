import { Directive, EventEmitter, Output } from '@angular/core';
import { renderSwitch, resolveAccessibilityProps } from '@symbiotejs/components';
import type {
  ISwitchPlatform,
  ISwitchProps,
  ISwitchState,
  ISwitchTrackColor,
} from '@symbiotejs/components';
import {
  createInitialSwitchState,
  shouldSnapBack,
  switchReducer,
  valueFromChange,
} from '@symbiotejs/components';
import {
  dispatchViewCommand,
  dlog,
  isSymbioteNode,
  whenCommitted,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IStyleProp,
  type IViewStyle,
} from '@symbiotejs/engine';

export type { ISwitchProps, ISwitchTrackColor } from '@symbiotejs/components';

export type ISwitchInputs = Pick<
  ISwitchProps,
  | 'value'
  | 'disabled'
  | 'trackColor'
  | 'thumbColor'
  | 'ios_backgroundColor'
  | 'style'
  | 'nativeID'
  | 'testID'
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'accessibilityState'
  | 'accessibilityValue'
  | 'accessibilityHint'
  | 'accessible'
  | 'role'
  | 'aria-label'
  | 'aria-disabled'
  | 'aria-checked'
>;

type ISwitchHostPlatform = ISwitchPlatform & { snapBackCommand: string };

type IHostProps = Record<string, unknown>;

function readSwitchNode(value: unknown): ISymbioteNode | null {
  if (isSymbioteNode(value)) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'node' in value &&
    isSymbioteNode(value.node)
  ) {
    return value.node;
  }
  return null;
}

function isSwitchEvent(event: unknown): event is ISymbioteEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'nativeEvent' in event &&
    typeof event.nativeEvent === 'object' &&
    event.nativeEvent !== null
  );
}

// @Directive() (no selector) is the Angular-sanctioned decorator for an abstract base whose
// concrete subclasses are real @Components — ngc's AOT build (NG2007) requires it the moment the
// base itself carries decorated members (@Output() here), mirroring ScrollViewBase.
@Directive()
export abstract class SwitchBase implements ISwitchInputs {
  // The value/change lifecycle as real Angular events: `(valueChange)="onToggle($event)"`, not
  // `[onValueChange]="onToggle"` — mirrors Pressable's press/hover @Output() conversion. Unlike
  // Pressable's createPressHandlers, handleChange() below calls `.emit()` unconditionally: it needs
  // no "was this bound" adapter because EventEmitter.emit() is already a safe no-op with no subscribers.
  @Output() readonly valueChange = new EventEmitter<boolean>();
  @Output() readonly change = new EventEmitter<ISymbioteEvent>();
  value: boolean | undefined;
  disabled: boolean | undefined;
  trackColor: ISwitchTrackColor | undefined;
  thumbColor: string | undefined;
  ios_backgroundColor: string | undefined;
  style: IStyleProp<IViewStyle> | undefined;
  nativeID: string | undefined;
  testID: string | undefined;
  accessibilityLabel: string | undefined;
  accessibilityRole: ISwitchInputs['accessibilityRole'];
  accessibilityState: ISwitchInputs['accessibilityState'];
  accessibilityValue: ISwitchInputs['accessibilityValue'];
  accessibilityHint: string | undefined;
  accessible: boolean | undefined;
  role: ISwitchInputs['role'];
  'aria-label': string | undefined;
  'aria-disabled': boolean | undefined;
  'aria-checked': boolean | 'mixed' | undefined;

  protected abstract readonly platform: ISwitchHostPlatform;
  private switchState: ISwitchState = createInitialSwitchState();

  get hostProps(): IHostProps {
    const props = resolveAccessibilityProps(this.inputProps());
    const {
      value,
      disabled,
      trackColor,
      thumbColor,
      ios_backgroundColor,
      style,
      onValueChange: _onValueChange,
      ...passthrough
    } = props;

    return renderSwitch(
      {
        value: value === true,
        disabled,
        trackColor,
        thumbColor,
        ios_backgroundColor,
        style,
        passthrough,
      },
      this.platform,
    ).props;
  }

  handleChange(event: unknown, node: unknown): void {
    if (!isSwitchEvent(event)) return;
    this.change.emit(event);
    const next = valueFromChange(event);
    dlog(
      `Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`,
    );
    if (next === undefined) return;

    this.valueChange.emit(next);
    this.switchState = switchReducer(this.switchState, { type: 'native-reported', value: next });

    const hostNode = readSwitchNode(node);
    if (hostNode === null) return;
    queueMicrotask(() => this.snapBackIfNeeded(hostNode));
  }

  private snapBackIfNeeded(node: ISymbioteNode): void {
    const fabricValue = this.value === true;
    if (!shouldSnapBack(this.switchState, fabricValue)) {
      dlog(
        `Switch snap-back no-op reported=${String(this.switchState.lastNativeReport)} value=${fabricValue}`,
      );
      return;
    }

    dlog(
      `Switch ${this.platform.snapBackCommand} snap-back reported=${String(this.switchState.lastNativeReport)} value=${fabricValue}`,
    );
    whenCommitted(node, () => {
      dispatchViewCommand(node, this.platform.snapBackCommand, [fabricValue]);
    });
  }

  private inputProps(): Partial<ISwitchProps> {
    const props: Partial<ISwitchProps> = {
      value: this.value,
      disabled: this.disabled,
      trackColor: this.trackColor,
      thumbColor: this.thumbColor,
      ios_backgroundColor: this.ios_backgroundColor,
      style: this.style,
    };

    return {
      ...props,
      nativeID: this.nativeID,
      testID: this.testID,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityHint: this.accessibilityHint,
      accessible: this.accessible,
      role: this.role,
      'aria-label': this['aria-label'],
      'aria-disabled': this['aria-disabled'],
      'aria-checked': this['aria-checked'],
    };
  }
}
