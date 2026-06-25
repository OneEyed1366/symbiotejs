// Headless proof of forkEvent / unforkEvent (RN AnimatedImplementation.js ~519-538).
// Pure JS, no Fabric slot: we assert the three forkEvent cases and that unforkEvent
// removes a forked listener from an AnimatedEvent.
//   1. existing === undefined        -> the new listener becomes the handler.
//   2. existing is an AnimatedEvent  -> the listener is appended; the SAME handler is
//      returned and firing it drives the value AND both listeners.
//   3. existing is a plain function  -> a new function calling both, in order.
//   4. unforkEvent removes a forked listener from an AnimatedEvent.

import { AnimatedValue, event, forkEvent, unforkEvent } from '@symbiote/shared'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

// ---- 1. undefined existing: the listener becomes the handler ----------------

let solo = 0
const fromNothing = forkEvent(undefined, () => {
  solo += 1
})
fromNothing({ nativeEvent: {} })
assert(solo === 1, `forkEvent(undefined, fn) should return fn, got ${solo} calls`)

// ---- 2. AnimatedEvent existing: append, same handler, value still driven ----

const scrollY = new AnimatedValue(0)
const calls: string[] = []
const handler = event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
  listener: () => calls.push('config'),
})
const extra = (): void => {
  calls.push('forked')
}
const forked = forkEvent(handler, extra)
assert(forked === handler, 'forkEvent on an AnimatedEvent handler should return the same handler')

forked({ nativeEvent: { contentOffset: { y: 25 } } })
assert(scrollY.__getValue() === 25, `forked handler must still drive the value, got ${scrollY.__getValue()}`)
assert(
  calls.join(',') === 'config,forked',
  `both listeners should fire in order, got [${calls.join(',')}]`,
)

// ---- 3. unforkEvent removes the forked listener -----------------------------

calls.length = 0
unforkEvent(forked, extra)
forked({ nativeEvent: { contentOffset: { y: 30 } } })
assert(scrollY.__getValue() === 30, 'handler still drives the value after unfork')
assert(calls.join(',') === 'config', `unfork should drop the forked listener, got [${calls.join(',')}]`)

// ---- 4. plain-function existing: a new function calling both ----------------

const order: string[] = []
const base = (): void => {
  order.push('base')
}
const combined = forkEvent(base, () => order.push('added'))
assert(combined !== base, 'forking a plain function should return a NEW function')
combined({ nativeEvent: {} })
assert(order.join(',') === 'base,added', `combined should call both in order, got [${order.join(',')}]`)
// unforkEvent on a plain-function fork is a no-op (no removable seam) — must not throw.
unforkEvent(combined, base)

console.log('fork/unforkEvent listener order:', calls.join(',') || '(empty)', '| value:', scrollY.__getValue())
console.log('animated-fork-event.smoke OK')
