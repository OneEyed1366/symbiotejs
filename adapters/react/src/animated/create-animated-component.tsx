// createAnimatedComponent — wraps a base component (View / Text / Image / any) so
// it can take AnimatedNodes in its props. Reimplemented thin against symbiote's
// shared primitive: NO native driver, NO scheduleUpdate fallback — a frame is the
// scoped commit setNativeProps drives from the AnimatedProps leaf (ADR 0016). RN's
// createAnimatedComponent + useAnimatedProps + createAnimatedPropsHook are the
// structural reference, but their native helpers are deliberately not imported.
//
// Per render: build the AnimatedProps leaf for the current props, compute
// reducedProps (every animated node replaced by its current value) and hand those
// to the base component. A callback ref captures the rendered base component's
// public instance (the SymbioteNode the host config returns) and binds it to the
// leaf. An effect attaches the leaf to the value graph so flushValue reaches it,
// and detaches on unmount / when the leaf identity changes. The per-frame path is
// then: value.setValue / animation -> flushValue -> AnimatedProps.update() ->
// setNativeProps(node, partial).

import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ReactElement,
  type Ref,
} from 'react'
import { AnimatedNode, isNativeAnimatedAvailable } from '@symbiote/engine'
import { AnimatedProps } from './props'
import { AnimatedStyle } from './style'

function isAnimatedNode(value: unknown): value is AnimatedNode {
  return value instanceof AnimatedNode
}

// RN's `passthroughAnimatedPropExplicitValues` carries explicit (already-rasterized) prop
// values — e.g. a sticky header's debounced `{style:{transform:[{translateY}]}}` — that must
// override the animated prop in the COMMITTED props so the Fabric ShadowTree (hit-testing)
// stays current while the native driver animates. Read its `style` without a cast.
function readPassthroughStyle(passthrough: unknown): unknown {
  if (typeof passthrough !== 'object' || passthrough === null) return undefined
  return Reflect.get(passthrough, 'style')
}

// Replace animated entries in a props map with their current rasterized values so
// React's first paint (and every re-render) carries concrete props. `style` is run
// through AnimatedStyle so an animated style key resolves to its current number.
function reduceProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(props)) {
    const value = props[key]
    if (key === 'style') {
      const styleNode = AnimatedStyle.from(value)
      out[key] = styleNode !== undefined ? styleNode.__getValue() : value
    } else if (isAnimatedNode(value)) {
      out[key] = value.__getValue()
    } else {
      out[key] = value
    }
  }
  return out
}

// A ref can be a function or a `.current` object; assign through both forms without
// casting so a forwarded ref from the caller still receives the instance.
function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (ref === undefined || ref === null) return
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  ref.current = value
}

export interface AnimatedComponentProps {
  style?: unknown
  ref?: Ref<unknown>
  [key: string]: unknown
}

// Base components carry their own concrete prop shape (View wants ViewStyle, etc.).
// We stay generic over that P so reduced props type-check against the base, while
// presenting an open animated-friendly surface (AnimatedComponentProps) to callers.
type AnimatableProps = { style?: unknown; children?: unknown }

export function createAnimatedComponent<P extends AnimatableProps>(
  Component: ComponentType<P>,
): ComponentType<AnimatedComponentProps> {
  function AnimatedComponent(props: AnimatedComponentProps): ReactElement {
    const { ref: forwardedRef, passthroughAnimatedPropExplicitValues: passthrough, ...rest } = props
    // Native driving is opt-in per the passthrough prop AND requires a real native module;
    // headless / unsupported hosts keep the JS flush path (and the existing JS smokes green).
    const wantsNative = passthrough != null && isNativeAnimatedAvailable()

    // One AnimatedProps leaf per distinct props object. Rebuilt when props change,
    // so a newly-added animated value joins the graph; the effect below swaps the
    // graph attachment to match.
    const animatedProps = useMemo(() => new AnimatedProps(rest), [rest])

    // The leaf currently wired into the value graph. Tracked across renders so a swap
    // can attach the new leaf BEFORE detaching the old one.
    const attached = useRef<AnimatedProps | null>(null)

    // Swap the graph attachment to the current leaf, attaching the new one FIRST and
    // detaching the previous one SECOND. Order is load-bearing: a shared Value node
    // self-detaches (and drops its native animation node) the instant its child count
    // hits zero, so detaching the old leaf before the new one is attached would kill a
    // running native-driven animation on any unrelated re-render. Detaching here (not
    // in a cleanup, which React runs BEFORE the next setup) keeps the new-before-old
    // order — mirroring RN's AnimatedComponent._attachProps.
    useEffect(() => {
      animatedProps.__attach()
      const previous = attached.current
      attached.current = animatedProps
      if (previous !== null && previous !== animatedProps) {
        previous.__detach()
      }
    }, [animatedProps])

    // Native-driver trigger (ADR 0017). Runs after attach: push the leaf -> style -> transform
    // -> interpolation -> value chain native so the props animate on the UI thread (no JS lag).
    // Cascades down to the source value; the scroll event attaches to that same value
    // (idempotent). __makeNative is idempotent, so re-firing on a leaf swap is safe.
    useEffect(() => {
      if (wantsNative) animatedProps.__makeNative()
    }, [animatedProps, wantsNative])

    // Final teardown: detach the last-attached leaf when the component unmounts.
    useEffect(() => {
      return () => {
        if (attached.current !== null) {
          attached.current.__detach()
          attached.current = null
        }
      }
    }, [])

    // Callback ref: when the base component mounts, capture its public instance (the
    // SymbioteNode) and bind it to the leaf, then forward to the caller's ref.
    const captureRef = (instance: unknown): void => {
      animatedProps.setNativeView(instance)
      assignRef(forwardedRef, instance)
    }

    // Reduced props are P-shaped (animated nodes already replaced by values); add the
    // capture ref. Build via Object.assign so the merged object stays typed as P & ref
    // without a cast — createElement then accepts it for the generic base component.
    const reduced = reduceProps(rest)
    // Override the committed style with the explicit passthrough values (last wins via the style
    // array, which the commit layer flattens) so the ShadowTree carries the current transform.
    const passthroughStyle = readPassthroughStyle(passthrough)
    if (passthroughStyle !== undefined) {
      reduced.style = reduced.style === undefined ? passthroughStyle : [reduced.style, passthroughStyle]
    }
    const childProps: P & { ref: (instance: unknown) => void } = Object.assign(
      Object.create(null),
      reduced,
      { ref: captureRef },
    )
    return createElement(Component, childProps)
  }

  AnimatedComponent.displayName = `Animated(${Component.displayName ?? Component.name ?? 'Anonymous'})`
  return AnimatedComponent
}
