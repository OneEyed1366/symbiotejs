// The driver contract. A concrete animation (timing / spring / decay, all
// Phase 2) is a number -> number machine: `start` is handed the value's current
// number and an `onUpdate` it calls each frame with the next number; `onEnd`
// fires exactly once. This interface is the seam between AnimatedValue and the
// drivers, so it lives here, free of any concrete driver.

import type { AnimatedValue } from './value'

export interface EndResult {
  finished: boolean
}

export type EndCallback = (result: EndResult) => void

export interface Animation {
  start(
    fromValue: number,
    onUpdate: (value: number) => void,
    onEnd: EndCallback,
    previousAnimation: Animation | null,
    animatedValue: AnimatedValue,
  ): void
  stop(): void
}
