// Headless proof of tracking — Animated.timing/spring with `toValue: anotherValue`
// makes a value CHASE a moving target. Two parts:
//   A) public API wiring: timing(f, { toValue: t }).start() attaches a tracking node
//      as a child of the target, and stop() tears it down.
//   B) mechanism: driving an AnimatedTracking with an instant fake driver, changing
//      the target re-launches toward the new value, and stopping detaches it so the
//      follower stops chasing. The fake driver keeps the test off the real timeline.

import { AnimatedValue, AnimatedTracking, timing } from '@symbiote/shared'
import type { Animation, EndCallback } from '../../packages/shared/src/animated/animation'

// Part A starts a real TimingAnimation (to prove the public wiring), which needs a
// host rAF. We never advance a frame — we only assert the tracking attaches and that
// stop() detaches it — so a no-op rAF that never fires is enough.
Object.assign(globalThis, {
  requestAnimationFrame: (): number => 1,
  cancelAnimationFrame: (): void => {},
})

// ---- A. the public timing(toValue: node) wires a tracking onto the target ----

{
  const follower = new AnimatedValue(0)
  const target = new AnimatedValue(10)

  const anim = timing(follower, { toValue: target, duration: 100 })
  anim.start()

  if (target.__getChildren().length < 1) {
    throw new Error('timing(toValue: node) must attach a tracking node as a child of the target')
  }

  anim.stop()
  if (target.__getChildren().length !== 0) {
    throw new Error('stopping a tracking animation must detach the tracking node from the target')
  }
}

// ---- B. tracking re-launches on target change, stops on detach ---------------

// An instant driver: jump straight to the target and finish. Lets us assert the
// tracking wiring without advancing real frames.
function instantTo(target: number): Animation {
  return {
    start(_fromValue: number, onUpdate: (value: number) => void, onEnd: EndCallback): void {
      onUpdate(target)
      onEnd({ finished: true })
    },
    stop(): void {},
  }
}

{
  const follower = new AnimatedValue(0)
  const target = new AnimatedValue(10)

  const tracking = new AnimatedTracking(follower, target, (toValue) => instantTo(toValue))
  follower.track(tracking)

  // track() immediately launches toward the target's current value.
  if (follower.__getValue() !== 10) {
    throw new Error(`tracking should drive the follower to the target's 10, got ${follower.__getValue()}`)
  }

  // The target moves -> the follower chases it (re-launch via the leaf update).
  target.setValue(25)
  if (follower.__getValue() !== 25) {
    throw new Error(`follower should chase the target to 25, got ${follower.__getValue()}`)
  }

  // Stopping the follower detaches the tracking; further target moves are ignored.
  follower.stopAnimation()
  target.setValue(99)
  if (follower.__getValue() !== 25) {
    throw new Error(`after stopAnimation the follower must stop chasing, got ${follower.__getValue()}`)
  }
  if (target.__getChildren().length !== 0) {
    throw new Error('stopAnimation must detach the tracking node from the target')
  }
}

console.log('tracking: follower chased 10 -> 25, stopped at 25')
console.log('animated-tracking.smoke OK')
