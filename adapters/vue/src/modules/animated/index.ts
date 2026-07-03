// The Animated namespace for @symbiotejs/vue: the Vue twin of adapters/react/src/animated/index.ts.
// createAnimatedComponent applied to the Vue primitives gives Animated.View / Text / Image; the
// value graph, easing and imperative drivers come from @symbiotejs/engine (framework-agnostic,
// JS-driven, ADR 0016), spread in verbatim. Both halves meet here so the familiar surface,
// `Animated.timing(new Animated.Value(0), …).start()`, works against the Vue-driven engine.

import {
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  AnimatedMock,
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
} from '@symbiotejs/engine';
import { View, Text } from '../../components';
import { Image } from '../../components/image';
import { ScrollView } from '../../components/scroll-view';
import { createAnimatedComponent } from './create-animated-component';

export { createAnimatedComponent } from './create-animated-component';

// View/Text are pure host primitives; Image is the functional renderImage wrapper, and all expose
// their host node via ref fall-through, so wrap them eagerly.
const AnimatedView = createAnimatedComponent(View);
const AnimatedText = createAnimatedComponent(Text);
const AnimatedImage = createAnimatedComponent(Image);

// ScrollView is wrapped behind a LAZY, memoized getter, mirroring RN's `get ScrollView()` and the
// React adapter: ScrollView's module chain imports this Animated namespace back (sticky headers,
// Phase 3), so a static createAnimatedComponent(ScrollView) at init could read ScrollView inside
// its own TDZ. A memoized getter defers the wrap past module init, so the cycle never fires.
let animatedScrollView: ReturnType<typeof createAnimatedComponent> | undefined;

// FlatList / SectionList: DEFERRED. The Vue adapter has no FlatList/SectionList base component yet
// (the React adapter does), so there is nothing to wrap; Animated.FlatList / Animated.SectionList
// are intentionally OMITTED, not faked. They land once those base components exist (you cannot wrap
// a component that does not exist). This is a named gap, not a silent drop.

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
};

// RN swaps the WHOLE driver namespace for the mock when the host reports isDisableAnimations
// (reduced motion / test env): the mock keeps the same surface but jumps each animation to its
// final value synchronously, no frames. The animated COMPONENTS (View/Text/Image + the lazy
// ScrollView getter) are live in both branches; only the drivers/value/operators/events half is
// swapped, exactly like RN spreading `...Animated` (impl or mock) over the same component getters.
const drivers = Platform.isDisableAnimations ? AnimatedMock : liveDrivers;

export const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  get ScrollView(): ReturnType<typeof createAnimatedComponent> {
    animatedScrollView ??= createAnimatedComponent(ScrollView);
    return animatedScrollView;
  },
  createAnimatedComponent,
  ...drivers,
};
