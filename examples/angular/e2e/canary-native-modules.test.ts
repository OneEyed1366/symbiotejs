import { by, device, element, waitFor } from 'detox';

// Journeys for CanaryScreen's native-module action buttons: StatusBar (hidden/style toggle —
// both iOS and Android; background/translucent are Android-only), Alert, ActionSheetIOS
// (iOS-only), Vibration. Share and Linking.openURL are deliberately NOT exercised — see the
// skips below for why.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// element(...).tap() runs Detox's own hittability pre-check (dtx_assertHittableAtPoint) first,
// which deterministically misfires for several buttons on this screen even though they're
// genuinely on-screen and tappable (confirmed via raw mobile-mcp coordinate taps in prior
// investigation — see the symbiote-detox-e2e skill, wix/Detox #3130/#4747/#2229). device.tap(point)
// is a raw simulator-level tap with NO element-matcher hittability check, so reading the element's
// real on-screen center via getAttributes().frame and tapping that point sidesteps the bug
// entirely instead of chasing settle delays that can't fix a geometry pre-check that never passes.
// A single frame read right after bringIntoView's scroll can still be stale — the scroll gesture's
// own momentum keeps drifting for a beat after it resolves (same root cause bringIntoView's own
// settle sleep exists for), so this re-reads the frame until two consecutive reads agree before
// tapping, rather than trusting one read that might land mid-drift.
async function deviceTap(id: string): Promise<void> {
  let last: { x: number; y: number; width: number; height: number } | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const attrs = await element(by.id(id)).getAttributes();
    if (!('frame' in attrs)) throw new Error(`${id}: getAttributes() returned no frame`);
    const { x, y, width, height } = attrs.frame;
    if (last && Math.abs(x - last.x) < 1 && Math.abs(y - last.y) < 1) break;
    last = { x, y, width, height };
    await sleep(150);
  }
  if (!last) throw new Error(`${id}: getAttributes() returned no frame`);
  const point = { x: last.x + last.width / 2, y: last.y + last.height / 2 };
  // TEMP DIAGNOSTIC — remove before merging.
  console.log(`DIAG deviceTap(${id}) frame=${JSON.stringify(last)} point=${JSON.stringify(point)}`);
  await device.takeScreenshot(`DIAG-before-${id}`);
  await device.tap(point);
  await device.takeScreenshot(`DIAG-after-${id}`);
}

// Copied verbatim from probe.test.ts — see that file's comment for the full rationale
// (below-the-fold targets need an explicit scroll since sync is off).
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

describe('Angular canary native-module buttons', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the Canary screen', async () => {
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);

    // Unlike probe.test.ts, this file's next test scrolls immediately (bringIntoView), so the
    // ScrollView's own layout needs to settle here rather than incidentally across several
    // non-scrolling tests first — otherwise the first scrollTo('top') hits a zero-height
    // container.
    await waitFor(element(by.id('angular-canary-scroll')))
      .toBeVisible()
      .withTimeout(10_000);
    await sleep(300);
  });

  it('toggles the status bar hidden state via its own title text', async () => {
    await bringIntoView('angular-status-bar-hidden-btn');
    await element(by.id('angular-status-bar-hidden-btn')).tap();
    await waitFor(element(by.text('Show status bar')))
      .toExist()
      .withTimeout(10_000);

    await bringIntoView('angular-status-bar-hidden-btn');
    await element(by.id('angular-status-bar-hidden-btn')).tap();
    await waitFor(element(by.text('Hide status bar')))
      .toExist()
      .withTimeout(10_000);
  });

  it('toggles the status bar style via its own title text', async () => {
    await bringIntoView('angular-status-bar-style-btn');
    await deviceTap('angular-status-bar-style-btn');
    await waitFor(element(by.text('Light text')))
      .toExist()
      .withTimeout(10_000);

    await bringIntoView('angular-status-bar-style-btn');
    await deviceTap('angular-status-bar-style-btn');
    await waitFor(element(by.text('Dark text')))
      .toExist()
      .withTimeout(10_000);
  });

  // angular-status-bar-bg-btn only renders under `@if (Platform.OS === 'android')` in
  // CanaryScreen — this suite runs against the iOS simulator, so the testID never exists in
  // the tree. Guarded at runtime rather than skipped outright so the same file picks this up
  // automatically on an Android run instead of silently staying dark forever.
  it('toggles the status bar background color on Android only', async () => {
    if (device.getPlatform() !== 'android') return;

    await bringIntoView('angular-status-bar-bg-btn');
    await element(by.id('angular-status-bar-bg-btn')).tap();
    await waitFor(element(by.text('BG default')))
      .toExist()
      .withTimeout(10_000);
  });

  // Same Android-only guard as above — angular-status-bar-translucent-btn.
  it('toggles status bar translucency on Android only', async () => {
    if (device.getPlatform() !== 'android') return;

    await bringIntoView('angular-status-bar-translucent-btn');
    await element(by.id('angular-status-bar-translucent-btn')).tap();
    await waitFor(element(by.text('Opaque')))
      .toExist()
      .withTimeout(10_000);
  });

  it('opens the native Alert and dismisses it via Cancel', async () => {
    await bringIntoView('angular-alert-btn');
    await deviceTap('angular-alert-btn');
    await waitFor(element(by.text('Cancel')))
      .toBeVisible()
      .withTimeout(10_000);

    // Only Cancel — Vibrate is a live device action, not the outcome under test here.
    await element(by.text('Cancel')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });

  // angular-action-sheet-btn only renders under `@if (Platform.OS !== 'android')` — present on
  // this iOS run.
  it('opens the native action sheet and dismisses it via Cancel', async () => {
    await bringIntoView('angular-action-sheet-btn');
    await deviceTap('angular-action-sheet-btn');
    await waitFor(element(by.text('Cancel')))
      .toBeVisible()
      .withTimeout(10_000);

    // Only Cancel — Share/Vibrate are live actions (a real share sheet, a real vibration), not
    // the outcome under test here.
    await element(by.text('Cancel')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: Share.share(...) opens a real native UIActivityViewController whose exact
  // presentation and button set vary by iOS version/installed apps — no stable, version-safe
  // way to interact with or dismiss it from Detox. Mirrors the angular-open-modal skip style in
  // probe.test.ts: a documented, deliberate gap, not an oversight.
  it.skip('shares content via the native share sheet', async () => {
    await bringIntoView('angular-share-btn');
    await element(by.id('angular-share-btn')).tap();
  });

  // SKIPPED: onOpenUrl calls Linking.openURL('https://angular.dev'), which BACKGROUNDS the app
  // into Safari — Detox has no control over an external app, so this would either hang the
  // suite or fail unpredictably trying to bring the canary back to the foreground.
  it.skip('opens an external URL via Linking.openURL', async () => {
    await bringIntoView('angular-open-url-btn');
    await element(by.id('angular-open-url-btn')).tap();
  });

  it('vibrates without crashing the app', async () => {
    await bringIntoView('angular-vibrate-btn');
    await deviceTap('angular-vibrate-btn');
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });
});
