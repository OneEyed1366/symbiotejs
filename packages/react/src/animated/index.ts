// The Animated namespace for @symbiote/react. createAnimatedComponent applied to
// the adapter's primitives gives Animated.View / Text / Image; the value graph,
// easing and imperative drivers come from @symbiote/shared (framework-agnostic,
// JS-driven — ADR 0016). Both halves meet here in one `Animated` object so the
// familiar surface — `Animated.timing(new Animated.Value(0), …).start()` — works.

import {
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
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
} from '@symbiote/shared'
import { View, Text } from '../components'
import { Image } from '../image'
import { createAnimatedComponent } from './create-animated-component'

export { createAnimatedComponent } from './create-animated-component'
export { AnimatedProps } from './props'
export { AnimatedStyle, AnimatedTransform } from './style'

const AnimatedView = createAnimatedComponent(View)
const AnimatedText = createAnimatedComponent(Text)
const AnimatedImage = createAnimatedComponent(Image)

export const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  createAnimatedComponent,
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
}
