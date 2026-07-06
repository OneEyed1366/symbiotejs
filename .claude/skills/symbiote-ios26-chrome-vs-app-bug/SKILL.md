---
name: symbiote-ios26-chrome-vs-app-bug
description: "Read when investigating a visual glitch on iOS (flicker, seam, border, color snap, momentary artifact near screen edges/corners/navigation header) reported against a Symbiote example app on iOS 26+. Covers two confirmed iOS 26 'Liquid Glass' system rendering behaviors mistaken for app bugs during a real navigation investigation: (1) a 1px anti-aliasing seam at the device's rounded screen corners, brightness ~130-215 gray, position drifting by x as y changes (following the corner arc) — confirmed present in Settings.app, not Symbiote-specific; (2) UINavigationBar back buttons rendering as a translucent floating pill immediately after a push/pop, then morphing into the flat/opaque bar style — also confirmed in Settings.app on a dark screen. Covers the decisive verification method: reproduce the SAME interaction in a stock system app (Settings) at the same screen position/theme, since iOS 26 chrome varies by background lightness (near-invisible on light screens, obvious on dark ones) — this cross-app comparison is what actually settles 'is this ours or the platform's', not code reading or pixel analysis alone. Trigger on: 'screen flickers/blinks near edges after a transition', 'button changes color/shape right after focus', 'thin line/seam at the corner', 'is this our bug or iOS', any RNS/native-stack visual glitch triage on iOS 26 simulators/devices."
---

# iOS 26 system chrome vs. an actual Symbiote bug

A real investigation (2026-07, packages/navigation Stack transitions) burned
significant effort chasing a reported "screen flickers along its edges with the
previous screen for ~0.5s after a push/pop" before two of the three visible
symptoms turned out to be iOS 26's own "Liquid Glass" rendering — not
SymbioteNative, not react-native-screens, not fixable/patchable JS-side.

## The two confirmed iOS-26-only artifacts

1. **1px rounded-corner anti-aliasing seam.** A single physical pixel, RGB in
   the ~(130–220, 130–220, 130–220) light-gray range, sitting exactly on the
   boundary between app content and whatever's beyond the device's rounded
   corner. Its x-position drifts by ~1px as y changes, tracing the corner's
   arc — a textbook clip-mask anti-aliasing artifact, not a color/logic bug.
   Confirmed via `ImageMagick`'s `magick <crop>.png txt:-` pixel dump (see
   `verification-before-completion`/pixel-forensics technique from that same
   session) then reproduced identically in Settings.app on a dark settings
   screen at the same simulator position.
2. **Back button "pill → flat" morph.** Right after a push/pop, the native
   header back button briefly renders as a floating, semi-transparent
   pill-shaped chip (Liquid Glass's default in-transition button style), then
   snaps to the flat opaque nav-bar style once the transition settles. Also
   reproduced in Settings.app. Only visible against a dark screen background —
   the same morph happens on light screens too, it's just imperceptible
   against a white/light background, which is why it went unnoticed until a
   dark-themed screen was involved.

Both were verified, not assumed — pixel-dumped and/or visually reproduced in a
totally unrelated stock app. Code-reading alone (checking `headerTintColor`,
`headerStyle`, `.screen`'s CSS class for a stray `border-radius`) came back
clean *before* the cross-app test, which was the right order: rule out "is it
even our prop" first, then use the platform-comparison test as the deciding
evidence, not a first resort.

## The decisive verification method

**Reproduce the exact same interaction in a stock system app (Settings.app is
the always-available reference) at the same screen position and, critically,
the same background lightness.** iOS 26's Liquid Glass chrome intensity is
background-dependent — near-invisible on light/white screens, obvious on dark
ones. A cross-app test done on the wrong-lightness screen can produce a false
negative ("I don't see it in Settings") that isn't actually a real
disagreement, just a lightness mismatch. When running this test, deliberately
navigate to a dark-themed screen in the comparison app before concluding "it's
not there."

This is the same methodology already used earlier in the same investigation to
rule out a suspected device-bezel line — screenshot a different app in the
identical simulator position and compare. It generalizes: **any "is this our
rendering or the platform's" question on iOS resolves by reproducing in a
stock app, not by reading source or reasoning about compositing order.**

## What's still open

A real, separate, non-platform finding from the same investigation: Stack's
pop path shows a consistent ~480ms gap between the native pop transition
starting (`onWillDisappear`) and the JS reducer's Fabric commit actually
removing the popped route (measured via `dlog` in
`packages/navigation/src/react/stack.ts`). Whether this lag has ANY visible
consequence is unconfirmed now that the two suspected symptoms above turned
out to be platform chrome — treat it as a known timing characteristic, not a
proven bug, unless a NEW visual symptom survives its own cross-app test.
