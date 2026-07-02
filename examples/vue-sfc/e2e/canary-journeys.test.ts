import { readFileSync } from 'fs'
import { by, device, element, expect, waitFor } from 'detox'

// Canary user-journey e2e (ADR 0025). Detox attaches at the stock RN host BELOW the renderer
// symbiote replaces, so this exact spec is framework-agnostic: the identical file runs against the
// React, Vue-TSX and Vue-SFC canaries — all three render the same surface with the same testIDs
// (the testID contract in .docs/e2e-cases/feature-vue.e2e-cases.md). Each journey drives a real
// native interaction AND asserts the observable outcome of ONE component, so a component that
// mounts but MIS-behaves — e.g. a native-driver Animated view that renders frozen — fails HERE,
// where a bare toBeVisible would pass.
//
// Sync is OFF from the first launch: the canary runs a perpetual native Animated.loop heartbeat
// (ADR 0017 offload proof) so the app never reports idle and launchApp would hang waiting for it;
// detoxEnableSynchronization:0 via launchArgs is the same gate the attach probe uses.

const launchOpts = { newInstance: true, launchArgs: { detoxEnableSynchronization: 0 } }

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// Scroll the canary until the target is on screen. Demos sit at different depths below the launch
// fold, so every journey self-scrolls instead of assuming a fixed offset. startY 0.8 (not Detox's
// ~0.95 default) keeps the swipe start hittable above the safe area.
// scroll(...) is a real swipe gesture, not a discrete scrollTo — ScrollView's own momentum
// keeps drifting briefly after the gesture resolves, so a tap right after can land on a spot
// the target view has already scrolled away from. Settle before handing control back.
async function bringIntoView(id: string): Promise<void> {
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .whileElement(by.id('canary-scroll'))
    .scroll(300, 'down', NaN, 0.8)
  await sleep(300)
}

// Detox surfaces an element's text via getAttributes(). The return is a union — one element
// ({text,label,…}) or many ({elements:[…]}) — so narrow with `in` instead of casting.
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes()
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text
  return ''
}

// Poll an element's text until it matches (Detox waitFor has no text-predicate form). Used for the
// async readouts (Image.getSize resolving, measure() writing the frame) that settle after a beat.
async function waitForText(id: string, matches: (text: string) => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    last = await elementText(id)
    if (matches(last)) return
    await sleep(250)
  }
  throw new Error(`${id} never matched within ${timeoutMs}ms; last text was "${last}"`)
}

// Sync is off (file header), so Detox's own native hittability check (dtx_assertHittableAtPoint)
// occasionally throws "not hittable" for a split second right after a text-changing recommit
// retriggers layout, even though the view is genuinely on-screen and untouched — confirmed via a
// screenshot taken at the exact failure point showing the card fully visible and correctly
// updated. Retry past this known false-negative instead of chasing a native race that isn't an
// app bug.
async function tapWithRetry(id: string, attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await element(by.id(id)).tap()
      return
    } catch (error) {
      if (attempt === attempts) throw error
      await sleep(300)
    }
  }
}

// Animation liveness WITHOUT reading opacity/transform from JS (impossible for a native-driven
// value — the frames live on the UI thread). element().takeScreenshot crops to THIS component and
// resolves to a PNG path; two crops that differ byte-for-byte prove motion, identical crops prove a
// freeze. This is what catches the static-circle class on-device. Element screenshots are iOS-solid;
// on Android they depend on the Detox version (see the e2e-cases doc's open question).
async function elementShot(id: string, name: string): Promise<Buffer> {
  const path = await element(by.id(id)).takeScreenshot(name)
  return readFileSync(path)
}

// "Animating" = any consecutive pair of 3 samples over ~500ms differs. Three samples (not two)
// avoid a false freeze when one sample lands on the momentary peak/trough of the breathe curve,
// where scale is instantaneously flat.
async function assertAnimating(id: string): Promise<void> {
  const a = await elementShot(id, `${id}-anim-0`)
  await sleep(250)
  const b = await elementShot(id, `${id}-anim-1`)
  await sleep(250)
  const c = await elementShot(id, `${id}-anim-2`)
  if (a.equals(b) && b.equals(c)) {
    throw new Error(`${id} is not animating: 3 element screenshots over 500ms were identical (frozen)`)
  }
}

// A one-shot move: snapshot the dot, fire the trigger, let the curve settle, snapshot again.
// Identical before/after = the animation never moved the view (the tap-driven slide/track bug class).
async function assertTapMoves(triggerId: string, dotId: string): Promise<void> {
  const before = await elementShot(dotId, `${dotId}-before`)
  await element(by.id(triggerId)).tap()
  await sleep(900) // the slide/spring curves run ~600-700ms; settle past the end
  const after = await elementShot(dotId, `${dotId}-after`)
  if (before.equals(after)) {
    throw new Error(`${dotId} did not move after tapping ${triggerId}: before/after screenshots identical`)
  }
}

describe('symbiote canary · user journeys', () => {
  beforeAll(async () => {
    await device.launchApp(launchOpts)
    // Sync is OFF, so nothing auto-waits for the first commit. Gate on the scroll container existing
    // before any journey scrolls/queries, or the first whileElement(...).scroll() races the launch.
    await waitFor(element(by.id('canary-scroll'))).toExist().withTimeout(30_000)
  })

  // ---- pre-existing journeys (kept) -----------------------------------------------------------

  it('counter card increments on each tap (event -> recommit)', async () => {
    await bringIntoView('counter-card')
    await expect(element(by.id('counter-value'))).toHaveText('tapped 0×')
    // Sync is off (see file header), so a bare expect right after tap() races the
    // JS event -> setState -> recommit round-trip; poll like the other async readouts below.
    await tapWithRetry('counter-card')
    await waitForText('counter-value', text => text === 'tapped 1×', 3_000)
    await tapWithRetry('counter-card')
    await waitForText('counter-value', text => text === 'tapped 2×', 3_000)
  })

  it('typing a name updates the greeting (controlled TextInput)', async () => {
    await bringIntoView('greeting-input')
    await element(by.id('greeting-input')).tap()
    await element(by.id('greeting-input')).typeText('Ada')
    await expect(element(by.id('greeting-output'))).toHaveText('Hello, Ada')
    await element(by.id('greeting-input')).clearText()
    await expect(element(by.id('greeting-output'))).toHaveText('Hello, stranger')
  })

  it('opens and closes the Modal', async () => {
    await bringIntoView('modal-open')
    await element(by.id('modal-open')).tap()
    await waitFor(element(by.id('modal-card'))).toBeVisible().withTimeout(5_000)
    await element(by.id('modal-close')).tap()
    await waitFor(element(by.id('modal-card'))).not.toBeVisible().withTimeout(5_000)
  })

  it('responder chip survives a native-tap recommit', async () => {
    await bringIntoView('resp-chip-0')
    await element(by.id('resp-chip-0')).tap()
    await expect(element(by.id('resp-chip-0'))).toBeVisible()
  })

  // ---- Switch drives a sibling component ------------------------------------------------------

  it('Switch toggles the ActivityIndicator visibility', async () => {
    await bringIntoView('spinner-switch')
    await expect(element(by.id('spinner-indicator'))).toBeVisible()
    await element(by.id('spinner-switch')).tap()
    await waitFor(element(by.id('spinner-indicator'))).not.toBeVisible().withTimeout(5_000)
    await element(by.id('spinner-switch')).tap()
    await waitFor(element(by.id('spinner-indicator'))).toBeVisible().withTimeout(5_000)
  })

  // ---- Animated liveness: the static-circle regression class ----------------------------------

  it('native-driven pulse keeps animating (not frozen)', async () => {
    await bringIntoView('pulse-dot')
    await assertAnimating('pulse-dot')
  })

  it('JS-driver slide moves on tap', async () => {
    await bringIntoView('slide-js-btn')
    await assertTapMoves('slide-js-btn', 'slide-js-dot')
  })

  it('native-driver slide moves on tap', async () => {
    await bringIntoView('slide-native-btn')
    await assertTapMoves('slide-native-btn', 'slide-native-dot')
  })

  it('tracking follower chases the lead on tap', async () => {
    await bringIntoView('track-btn')
    await assertTapMoves('track-btn', 'follow-dot')
  })

  // ---- NativeModules / Image statics / imperative ref -----------------------------------------

  it('persisting a tap changes the stored counter (Settings round-trip)', async () => {
    await bringIntoView('persist-count')
    const before = await elementText('persist-count')
    await element(by.id('persist-btn')).tap()
    // The readout is "persisted taps: N · survives relaunch"; N bumps, so the whole string changes.
    await waitForText('persist-count', text => text !== before && text.length > 0, 5_000)
  })

  it('Image.getSize resolves the logo dimensions', async () => {
    await bringIntoView('logo-size')
    // Starts "logo size: measuring…", resolves to "logo size: W×Hpx" once ImageLoader answers.
    await waitForText('logo-size', text => /logo size: \d+×\d+px/.test(text), 10_000)
  })

  it('imperative measure writes the on-screen frame', async () => {
    await bringIntoView('measure-btn')
    await element(by.id('measure-btn')).tap()
    // "frame: tap …" → "frame: x123 y456 · …" once measure() resolves the live frame.
    await waitForText('measure-frame', text => /x-?\d+ y-?\d+/.test(text), 5_000)
  })

  // ---- virtualized lists render and commit on-device ------------------------------------------

  it('chips FlatList renders and is visible', async () => {
    await bringIntoView('chips-list')
    await expect(element(by.id('chips-list'))).toBeVisible()
  })

  it('sticky SectionList renders and is visible', async () => {
    await bringIntoView('sticky-section-list')
    await expect(element(by.id('sticky-section-list'))).toBeVisible()
  })
})
