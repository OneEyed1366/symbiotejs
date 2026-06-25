// The Animated namespace for @symbiote/react. createAnimatedComponent applied to
// the adapter's primitives gives Animated.View / Text / Image; the value graph,
// easing and imperative drivers come from @symbiote/engine (framework-agnostic,
// JS-driven — ADR 0016). Both halves meet here in one `Animated` object so the
// familiar surface — `Animated.timing(new Animated.Value(0), …).start()` — works.

import {
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  Easing,
  Platform,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
} from '@symbiote/engine'
import { View, Text } from '../components'
import { Image } from '../image'
import { ScrollView } from '../scroll-view'
import { FlatList } from '../flat-list'
import { SectionList } from '../section-list'
import { createAnimatedComponent } from './create-animated-component'
import { AnimatedMock } from './mock'

export { createAnimatedComponent } from './create-animated-component'
export { AnimatedProps } from './props'
export { AnimatedStyle, AnimatedTransform } from './style'

// View/Text/Image are pure host primitives — wrap them eagerly.
const AnimatedView = createAnimatedComponent(View)
const AnimatedText = createAnimatedComponent(Text)
const AnimatedImage = createAnimatedComponent(Image)

// RN's AnimatedExports.js:13-58 exposes all six animated components. The scrolling
// containers (ScrollView/FlatList/SectionList) are wrapped behind LAZY getters,
// mirroring RN's `get ScrollView() { return require(...) }`: ScrollView's module
// chain pulls in scroll-view-sticky-header, which imports this Animated namespace
// back — a static `createAnimatedComponent(ScrollView)` at init would read ScrollView
// inside its own TDZ. A memoized getter defers the wrap past module init, so the
// cycle never fires. The wrappers carry no per-component animation logic — they only
// add animated-prop support, keeping the adapter thin (invariant adapters_stay_thin).
// The native scroll-event attach (Animated.event onto contentOffset) is owned by
// ScrollView itself.
let animatedScrollView: ReturnType<typeof createAnimatedComponent> | undefined
let animatedFlatList: ReturnType<typeof createAnimatedComponent> | undefined
let animatedSectionList: ReturnType<typeof createAnimatedComponent> | undefined

// The live, JS-driven driver namespace (real frames). RN's AnimatedImplementation.
const liveDrivers = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  Color: AnimatedColor,
  Easing,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
}

// RN's AnimatedExports.js:21 swaps the WHOLE namespace for the mock when the host
// reports isDisableAnimations (reduced motion / test env): the mock keeps the same
// surface but jumps each animation to its final value synchronously, no frames.
// The animated COMPONENTS (View/Text/Image + the lazy container getters) are live in
// both branches — only the drivers/value/operators/events half is swapped, exactly
// like RN spreading `...Animated` (impl or mock) over the same component getters.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers

export const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  get ScrollView(): ReturnType<typeof createAnimatedComponent> {
    animatedScrollView ??= createAnimatedComponent(ScrollView)
    return animatedScrollView
  },
  get FlatList(): ReturnType<typeof createAnimatedComponent> {
    animatedFlatList ??= createAnimatedComponent(FlatList)
    return animatedFlatList
  },
  get SectionList(): ReturnType<typeof createAnimatedComponent> {
    animatedSectionList ??= createAnimatedComponent(SectionList)
    return animatedSectionList
  },
  createAnimatedComponent,
  ...drivers,
}
