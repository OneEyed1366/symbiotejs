---
"@symbiote-native/components": minor
"@symbiote-native/react": patch
"@symbiote-native/vue": patch
"@symbiote-native/angular": patch
---

Extract two triplicated component machines into shared, framework-agnostic logic in
`@symbiote-native/components`, completing the enriched three-layer split for the last two
components that still re-implemented decision logic per adapter.

Touchable: the TouchableOpacity press-scheduling machine (delayPressIn defer, early-release
flush, activatedAt tracking, min-press-duration hold) and the TouchableHighlight underlay
gating were re-implemented line-for-line in React, Vue, and Angular. They now live once as
`createTouchableFeedbackRuntime` + `createTouchableFeedbackHandlers` (clock and scheduler
injected, so the machine is testable and timer globals stay out of core) and
`highlightPressedStyle`. Each adapter keeps only the `Animated.timing` opacity call, injected
via `activate`/`deactivate`.

ScrollView sticky headers: the per-header effect state machine (zero-swallow gate,
rebuild-interpolation-on-input-change, debounce pick, cross-talk feed-forward) was hand-written
in every adapter, and twice in Angular (component plus projection wrapper). It is now one
`reduceSticky(state, action, inputs)` enriched reducer plus a `resolveScrollForwarding` decision
helper that absorbs the onScroll branch, throttle defaults, inverted-height capture, and the
collapsableChildren predicate. Angular's projection wrapper collapses to a thin effect-runner
over the same reducer. Adapters keep only effect execution: the debounce timer, the
interpolate/listener wiring, and the re-render trigger.

Adapter prop surfaces and runtime behavior are unchanged; the rewrite is structural.
