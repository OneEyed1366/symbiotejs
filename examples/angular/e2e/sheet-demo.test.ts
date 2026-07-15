import { by, device, element, waitFor } from 'detox';

// Push/dismiss round trip for SheetDemoScreen (stackPresentation: 'formSheet', detents
// [0.3, 0.6, 1], sheetGrabberVisible: true) — reached from the Menu via menu-row-SheetDemo.
// The screen carries exactly one testID (sheet-dismiss, an ActionButton wired to
// navigation.pop()); the line-tag and hero copy have none, so sheet-dismiss doubles as both
// the landing signal for "the sheet rendered" and the dismiss action itself.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Both toBeVisible() and tap()'s own hittability pre-check are unreliable for content inside a
// formSheet presentation — sheet-dismiss's dismiss tap fails with "visible bounds: {{inf, inf},
// {0, 0}}", a clear sign Detox's geometry math breaks down across the presented view
// controller's boundary, not a real visibility problem (confirmed by canary-native-modules.test.ts
// and drawer-demo.test.ts hitting the identical class of false negative for unrelated reasons —
// see the symbiote-detox-e2e skill, wix/Detox #3130/#4747/#2229). getAttributes().frame is
// documented as "in screen coordinate space" and stays reliable, so deviceTap reads it directly
// for a raw simulator-level tap instead of going through the broken hittability check.
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) throw new Error(`${id}: getAttributes() returned no frame`);
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

// Same reasoning applied to toBeVisible(): the formSheet's own presentation transition moves
// sheet-dismiss into place, so poll its real frame instead of the geometry check that never
// resolves — settled once it stops moving for two consecutive reads.
async function waitForFrameSettle(id: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: { x: number; y: number } | undefined;
  let stableReads = 0;
  while (Date.now() < deadline) {
    const attrs = await element(by.id(id)).getAttributes();
    if ('frame' in attrs) {
      const { x, y } = attrs.frame;
      if (last && Math.abs(x - last.x) < 1 && Math.abs(y - last.y) < 1) {
        stableReads += 1;
        if (stableReads >= 2) return;
      } else {
        stableReads = 0;
      }
      last = { x, y };
    }
    await sleep(150);
  }
  throw new Error(`${id}'s frame never settled within ${timeoutMs}ms`);
}

describe('Angular sheet presentation demo', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('pushes SheetDemo from the menu and renders its content as a formSheet', async () => {
    await waitFor(element(by.id('menu-row-SheetDemo')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-SheetDemo')).tap();
    // Split into two waits: toExist confirms the push itself landed (rules out a navigation
    // problem) fast, well inside 10s. toBeVisible then needs longer — SheetDemoScreen's own
    // header comment documents that react-native-screens' formSheet content-sizing search
    // (RNSScreenContentWrapper walking the ScrollView's native subviews) is a real, separate
    // pass after the sheet transition itself, and a cold push compounds it under simulator load.
    await waitFor(element(by.id('sheet-dismiss')))
      .toExist()
      .withTimeout(10_000);
    await waitForFrameSettle('sheet-dismiss', 20_000);
  });

  it('dismisses the sheet via its own Dismiss button and returns to the menu', async () => {
    await deviceTap('sheet-dismiss');
    await waitFor(element(by.id('menu-row-SheetDemo')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  // SKIPPED: dragging the grabber between the 30%/60%/100% detents is a gesture on
  // react-native-screens' own native sheet chrome (RNSScreenContentWrapper / the OS sheet
  // controller), not a Symbiote-rendered view — there is no testID and no JS-side element to
  // target it through. Detox's .swipe()/.scroll() drive gestures against a matched element's
  // native view; the grabber sits outside the whole Fabric/Symbiote tree entirely, so no
  // matcher can reach it (this is a different limitation from the hittability bug documented
  // in the symbiote-detox-e2e skill for angular-open-modal/counter-card — there the target
  // view exists in the tree and Detox mismeasures it; here there is no view to measure at
  // all). Re-enable only if a future revision exposes a JS-drivable detent handle.
  it.skip('drags the sheet grabber between detents', async () => {});
});
