// Headless proof of AnimatedValueXY (ADR 0016) — JS only, no native module and no
// Fabric slot needed: AnimatedValueXY is not a driving node, it multiplexes two
// ordinary AnimatedValues. We assert that getLayout()/getTranslateTransform() hand
// back the LIVE x/y values (so a later setValue is visible through them), that
// setValue updates both axes, and that a combined listener fires with {x, y}.

import { AnimatedValue } from '@symbiote/engine'
// Not yet wired into the @symbiote/engine barrel (the coordinator owns that);
// import the class directly from its source.
import { AnimatedValueXY } from '../../core/engine/src/animated/value-xy'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

// ---- getLayout / getTranslateTransform are wired to the live x/y ----------

const xy = new AnimatedValueXY({ x: 1, y: 2 })

const layout = xy.getLayout()
assert(layout.left === xy.x, 'getLayout().left must be the live x value')
assert(layout.top === xy.y, 'getLayout().top must be the live y value')
assert(layout.left.__getValue() === 1, `getLayout().left should read 1, got ${layout.left.__getValue()}`)
assert(layout.top.__getValue() === 2, `getLayout().top should read 2, got ${layout.top.__getValue()}`)

const transform = xy.getTranslateTransform()
assert(transform.length === 2, `getTranslateTransform() should be a 2-tuple, got ${transform.length}`)
assert(transform[0].translateX === xy.x, 'transform[0].translateX must be the live x value')
assert(transform[1].translateY === xy.y, 'transform[1].translateY must be the live y value')

// ---- setValue updates both axes (and is visible through getLayout) --------

xy.setValue({ x: 10, y: 20 })
const moved = xy.__getValue()
assert(moved.x === 10 && moved.y === 20, `setValue should move to {10,20}, got ${JSON.stringify(moved)}`)
// the layout view returned earlier still points at the live values
assert(layout.left.__getValue() === 10, 'getLayout().left must reflect the new x after setValue')
assert(layout.top.__getValue() === 20, 'getLayout().top must reflect the new y after setValue')

// ---- a combined listener fires with {x, y} --------------------------------

interface ValueXYEvent {
  x: number
  y: number
}
const events: ValueXYEvent[] = []
const listenerId = xy.addListener((value) => {
  events.push({ x: value.x, y: value.y })
})

xy.setValue({ x: 3, y: 4 })
// x and y each fire once, so the joint callback runs twice; the final event must
// carry the fully-updated 2D value.
assert(events.length >= 1, 'combined listener should fire on setValue')
const last = events[events.length - 1]
assert(last.x === 3 && last.y === 4, `combined listener should report {3,4}, got ${JSON.stringify(last)}`)

// removeListener detaches both axes — no further events after removal
xy.removeListener(listenerId)
const countBefore = events.length
xy.setValue({ x: 5, y: 6 })
assert(events.length === countBefore, 'removed listener must not fire')

// sanity: the held child is a real AnimatedValue
assert(xy.x instanceof AnimatedValue, 'xy.x must be an AnimatedValue')

console.log('animated-value-xy.smoke OK')
