// The driver contract. A concrete animation (timing / spring / decay, all
// Phase 2) is a number -> number machine: `start` is handed the value's current
// number and an `onUpdate` it calls each frame with the next number; `onEnd`
// fires exactly once. This interface is the seam between AnimatedValue and the
// drivers, so it lives here, free of any concrete driver.

import type { AnimatedValue } from './value';

export interface IEndResult {
  finished: boolean;
}

export type IEndCallback = (result: IEndResult) => void;

export interface IAnimation {
  start(
    fromValue: number,
    onUpdate: (value: number) => void,
    onEnd: IEndCallback,
    previousAnimation: IAnimation | null,
    animatedValue: AnimatedValue,
  ): void;
  stop(): void;
}
