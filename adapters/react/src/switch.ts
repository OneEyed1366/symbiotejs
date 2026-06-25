// Switch — a controlled boolean input. Unlike TextInput there is no event-count
// handshake: `value` is a real Fabric prop that we pass straight through. The
// only subtlety is the controlled contract. Switch is controlled exactly like
// RN's: the parent's onValueChange MUST update `value` for the toggle to stick.
// If the handler is a no-op (parent ignores the change), native has already
// flipped its own grip, so JS must push the old value back down or the UI and
// the prop drift apart.
//
// RN does that snap-back with an imperative setNativeProps / SwitchCommands.setValue,
// triggered from a layout-effect that re-runs on every native report (RN wraps
// the native value in a fresh object so the effect fires even when the value is
// unchanged). We mirror that faithfully: handleChange records what native just
// reported, and a layout-effect commands `setValue` down whenever JS-side `value`
// disagrees with that last native report. Our commit also re-pushes `value` from
// the retained tree each render, but a re-push alone is not enough for the
// no-op-handler case — when the parent never updates `value`, the prop never
// changes, so the retained tree never diverges and nothing re-commits. The
// imperative command is the only path that corrects native after it self-toggled
// to a value JS rejects.

import { createElement, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { dispatchViewCommand, dlog, Platform, type SymbioteEvent, type SymbioteNode } from '@symbiote/engine'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

type EventHandler = (event: SymbioteEvent) => void

export interface SwitchTrackColor {
  false?: string
  true?: string
}

export interface SwitchProps extends AccessibilityProps, AriaProps {
  value?: boolean
  onValueChange?: (value: boolean) => void
  onChange?: EventHandler
  disabled?: boolean
  trackColor?: SwitchTrackColor
  thumbColor?: string
  ios_backgroundColor?: string
  style?: ViewStyle
}

// RN rounds the iOS background pill to this radius when ios_backgroundColor is set.
const IOS_BACKGROUND_BORDER_RADIUS = 16

function valueFromChange(event: SymbioteEvent): boolean | undefined {
  const value = event.nativeEvent.value
  return typeof value === 'boolean' ? value : undefined
}

// Fold ios_backgroundColor into the style, matching RN's iOS branch: it paints
// the background that shows through the shrunken track. Untouched when unset, so
// a caller's own backgroundColor wins by simply not passing ios_backgroundColor.
function foldIosBackground(style: ViewStyle | undefined, color: string | undefined): ViewStyle | undefined {
  if (color === undefined) return style
  return { ...style, backgroundColor: color, borderRadius: IOS_BACKGROUND_BORDER_RADIUS }
}

export const Switch: FC<SwitchProps> = (rawProps) => {
  // Switch owns its host element rather than rendering through a symbiote View, so
  // it folds aria/role into accessibility* here (View does this once for components
  // that wrap it). The resolved accessibility* fields ride down via `...rest`.
  const props = resolveAccessibilityProps(rawProps)
  const { value, onValueChange, onChange, disabled, trackColor, thumbColor, ios_backgroundColor, style, ...rest } =
    props

  const ref = useRef<SymbioteNode | null>(null)
  // The value native last reported, wrapped so the layout-effect re-runs on every
  // change report even when the boolean is unchanged from the prior report. This
  // is RN's trick: native may toggle to a value JS rejects, and we must still
  // command it back. Starts null — no native report has happened yet.
  const [lastNativeReport, setLastNativeReport] = useState<{ value: boolean | null }>({ value: null })

  const handleChange = useCallback(
    (event: SymbioteEvent): void => {
      onChange?.(event)
      const next = valueFromChange(event)
      dlog(`Switch onChange value=${String(next)} eventCount=${String(event.nativeEvent.eventCount)}`)
      if (next === undefined) return
      onValueChange?.(next)
      setLastNativeReport({ value: next })
    },
    [onChange, onValueChange],
  )

  // value is a real Fabric prop, but folded to a strict boolean: RN sends
  // `value === true`, so an undefined prop reads as "off" rather than absent.
  const fabricValue = value === true
  dlog(`Switch render value=${fabricValue} disabled=${String(disabled)}`)

  // Controlled snap-back: native toggled itself to lastNativeReport, but JS holds
  // fabricValue. If they disagree, the parent did not accept the change, so command
  // the JS value back down. A plain prop re-push cannot cover this — when the
  // handler is a no-op the prop never changes, so the retained tree never diverges.
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const reported = lastNativeReport.value
    if (reported === null || reported === fabricValue) {
      dlog(`Switch snap-back no-op reported=${String(reported)} value=${fabricValue}`)
      return
    }
    // Switch.js:221-225 — the snap-back command name is platform-specific:
    // Android dispatches setNativeValue, iOS dispatches setValue.
    const snapBackCommand = Platform.OS === 'android' ? 'setNativeValue' : 'setValue'
    dlog(`Switch ${snapBackCommand} snap-back reported=${String(reported)} value=${fabricValue}`)
    dispatchViewCommand(node, snapBackCommand, [fabricValue])
  }, [fabricValue, lastNativeReport])

  // Track-color prop names are platform-specific (Switch.js:229-281). iOS's native
  // component takes onTintColor (ON-track) / tintColor (OFF-track); Android's takes
  // trackColorForTrue / trackColorForFalse plus trackTintColor — the color for the
  // CURRENT value, which RN computes as `value === true ? true : false`. We branch on
  // Platform.OS exactly as RN's Switch.js does (this is a shared file, not a
  // .ios/.android split). thumbTintColor (the grip) rides both branches. These color
  // props reach Fabric as ordinary props: the shared ViewConfig declares Switch's only
  // event as `change`, so they are not event names and routeProp sends them through
  // setProp rather than treating them as listeners.
  const trackColorProps =
    Platform.OS === 'android'
      ? {
          trackColorForFalse: trackColor?.false,
          trackColorForTrue: trackColor?.true,
          trackTintColor: fabricValue ? trackColor?.true : trackColor?.false,
        }
      : {
          onTintColor: trackColor?.true,
          tintColor: trackColor?.false,
        }

  return createElement('symbiote-switch', {
    ...rest,
    ref,
    value: fabricValue,
    disabled,
    ...trackColorProps,
    thumbTintColor: thumbColor,
    style: foldIosBackground(style, ios_backgroundColor),
    onChange: handleChange,
  })
}
