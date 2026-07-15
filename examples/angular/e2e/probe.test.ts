import { by, device, element, waitFor } from 'detox';

// Go/no-go probe for the Angular canary. It proves the native RN host starts, the
// Angular adapter mounts through @symbiote-native/engine, and a Fabric view from the Angular
// template reaches the native hierarchy with its testID. The app boots on the navigation demo
// Menu screen (@symbiote-native/navigation's Stack) — the probe pushes into "Canary" first,
// the screen carrying every primitive under test.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CanaryScreen's demo list is long (dozens of sections) — an element below the fold exists but
// isn't hittable, so any tap/typeText target needs an explicit scroll first (sync is off, so
// nothing does this implicitly). Resets to the top first so this works regardless of where a
// prior test left the scroll position, then steps down a fixed distance at a time, checking
// visibility after each step — scrollTo('bottom') overshoots targets that sit well above the
// screen's true end (more demo sections follow them), and whileElement(...).scroll()'s own retry
// budget doesn't reach every target on a screen this long. The scroll gesture itself keeps
// drifting for a beat after it resolves (RN momentum/deceleration), so a settle delay follows
// before any tap/typeText targeting the result.
async function bringIntoView(id: string): Promise<void> {
  const scrollView = element(by.id('angular-canary-scroll'));
  const target = element(by.id(id));
  await scrollView.scrollTo('top');
  for (let step = 0; step < 15; step += 1) {
    try {
      await waitFor(target).toBeVisible().withTimeout(400);
      break;
    } catch {
      await scrollView.scroll(500, 'down');
    }
  }
  await waitFor(target).toBeVisible().withTimeout(3_000);
  await sleep(300);
}

describe('Angular symbiote attach probe', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the Canary screen through Fabric', async () => {
    // toExist alone races the Menu screen's own layout pass — the row can exist in the tree
    // a beat before it's laid out/hittable. toBeVisible waits for that to settle.
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders Angular text content through Fabric', async () => {
    await waitFor(element(by.id('angular-platform')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an Angular Image component through Fabric', async () => {
    await waitFor(element(by.id('angular-image')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an additional Angular host intrinsic through Fabric', async () => {
    await waitFor(element(by.id('angular-spinner-indicator')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders the Angular Switch component through Fabric', async () => {
    await waitFor(element(by.id('angular-spinner-switch')))
      .toExist()
      .withTimeout(10_000);
  });

  it('recommits after an Angular press handler updates state', async () => {
    await bringIntoView('angular-counter-card');
    await element(by.id('angular-counter-card')).tap();
    await waitFor(element(by.text('tapped 1×')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: angular-open-modal sits at elementFrame.y≈5862 inside this screen's very tall
  // scroll content (real on-screen frame.y≈588, well within the viewport — confirmed reachable
  // by a raw coordinate tap outside Detox). Detox's own hittability pre-check reports it
  // non-hittable regardless — a long-standing upstream issue (wix/Detox #3130, #4747, #2229;
  // the strict hittability assertion landed in 19.3.0 and is still open), likely aggravated here
  // by the two FlatLists nested inside this ScrollView (an anti-pattern Detox is known to
  // mis-measure around). Re-enable once upstream fixes hittability for deep/nested-scroll
  // targets, or if CanaryScreen's nested FlatLists are ever pulled out of the ScrollView.
  it.skip('opens and closes an Angular Modal through Fabric', async () => {
    await bringIntoView('angular-open-modal');
    await element(by.id('angular-open-modal')).tap();
    await waitFor(element(by.id('angular-modal-card')))
      .toExist()
      .withTimeout(10_000);
    await element(by.id('angular-close-modal')).tap();
    await waitFor(element(by.id('angular-modal-card')))
      .not.toExist()
      .withTimeout(10_000);
  });

  it('renders the Angular KeyboardAvoidingView toggle demo through Fabric', async () => {
    await waitFor(element(by.id('angular-kav-switch')))
      .toExist()
      .withTimeout(10_000);
  });

  it('edits an Angular TextInput and echoes the controlled value', async () => {
    await bringIntoView('angular-greeting-input');
    await element(by.id('angular-greeting-input')).typeText('hi');
    await waitFor(element(by.text('Hello, hi')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an Angular ImageBackground with children on top', async () => {
    await waitFor(element(by.id('angular-image-bg-label')))
      .toExist()
      .withTimeout(10_000);
  });
});
