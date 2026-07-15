import { by, device, element, waitFor } from 'detox'

// The go/no-go probe. It proves Detox attaches to a
// symbiote-driven tree at the stock RN host: launchApp() must complete the New-Arch startup sync
// (the #4506 bridgeless-deadlock gate), then a symbiote-rendered native view carrying the canary's
// existing testID={`resp-chip-${index}`} must be visible, and survive a recommit from a native tap.
// App.tsx boots on the navigation demo Menu screen (@symbiote-native/navigation's Stack) — the
// probe pushes into "Canary" first, the screen carrying resp-chip-0/canary-scroll.
describe('symbiote attach probe', () => {
  beforeAll(async () => {
    // The canary runs a perpetual native-driven Animated.loop heartbeat (App.tsx), so the app
    // never reports idle. Detox cannot sync against an infinite animation (true
    // on stock RN too). launchApp itself waits for idle, so sync must be off from the FIRST launch
    // via launchArgs (disableSynchronization() after launch is both too late and undone by the
    // new-instance re-enable). This probe verifies attach + visibility, not quiescence.
    await device.launchApp({ newInstance: true, launchArgs: { detoxEnableSynchronization: 0 } }) // ← the go/no-go gate
  })

  it('navigates from the menu into the Canary screen through Fabric', async () => {
    // toExist alone races the Menu screen's own layout pass — the row can exist in the tree
    // a beat before it's laid out/hittable. toBeVisible waits for that to settle.
    await waitFor(element(by.id('menu-row-Canary'))).toBeVisible().withTimeout(10_000)
    await element(by.id('menu-row-Canary')).tap()
    await waitFor(element(by.id('canary-scroll'))).toExist().withTimeout(10_000)
  })

  // Attach proof: a symbiote-rendered native view exists in the hierarchy carrying the canary's
  // testID. This proves the renderer drove nativeFabricUIManager AND propagated testID through to
  // Fabric. toExist, not toBeVisible: the chip sits below the launch fold inside the ScrollView.
  it('renders a symbiote-driven native view with its testID', async () => {
    await waitFor(element(by.id('resp-chip-0'))).toExist().withTimeout(10_000)
  })

  // Recommit proof: scroll the chip on-screen, tap it (native touch → symbiote event → recommit),
  // and confirm the tree survives: the chip is still there after the event-driven recommit.
  it('survives a symbiote recommit from a native tap', async () => {
    await waitFor(element(by.id('resp-chip-0')))
      .toBeVisible()
      .whileElement(by.id('canary-scroll'))
      .scroll(240, 'down')
    await element(by.id('resp-chip-0')).tap()
    await waitFor(element(by.id('resp-chip-0'))).toBeVisible().withTimeout(10_000)
  })
})
