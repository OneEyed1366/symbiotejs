import { by, device, element, waitFor } from 'detox';

// Scroll/list coverage for CanaryScreen that probe.test.ts doesn't touch: the outer
// RefreshControl, the static Dimensions/Keyboard readouts, the two FlatLists nested inside
// the outer ScrollView (chips, MVCP), and the native-driver parity header/scroll box proof.
// Same attach-below-the-renderer reasoning as probe.test.ts: Detox drives the native Fabric
// tree the Angular adapter committed to, so these assertions exercise the real host.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Copied verbatim from probe.test.ts (not shared via import — each e2e file in this project
// keeps its own copy; do not modify probe.test.ts). See that file's comment for why the scroll
// is manual (reset-to-top + stepped scroll-and-check) rather than a single whileElement(...).scroll().
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

// Detox surfaces a Text node's content via getAttributes(); the return is a union (one
// element vs a matched-array), so narrow with `in`/typeof instead of casting.
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

async function waitForText(
  id: string,
  matches: (text: string) => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await elementText(id);
    if (matches(last)) return;
    await sleep(250);
  }
  throw new Error(`${id} never matched within ${timeoutMs}ms; last text was "${last}"`);
}

describe('Angular canary lists & scroll', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
    // Unlike probe.test.ts, this file's first test scrolls immediately — there's no run of
    // plain existence checks near the top to absorb the layout race first. Wait for the
    // ScrollView itself to actually be laid out (real bounds, not zero-height) before any
    // scroll/bringIntoView call runs.
    await waitFor(element(by.id('angular-canary-scroll')))
      .toBeVisible()
      .withTimeout(10_000);
    await sleep(300);
  });

  it('renders a RefreshControl on the outer ScrollView', async () => {
    // RefreshControl has no stable on-screen frame until pulled below the content's own
    // top — assert it's mounted rather than driving the pull gesture, which Detox (sync off,
    // no native "released" signal to wait on) can't drive reliably without a flaky sleep-guess.
    await element(by.id('angular-canary-scroll')).scrollTo('top');
    await waitFor(element(by.id('angular-refresh-control')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders dimensions and keyboard status text with plausible content', async () => {
    await bringIntoView('angular-dimensions');
    // Both Texts are written as multi-line {{ }} interpolations, which keep their surrounding
    // whitespace/newlines (documented Angular gotcha) — match by content via getAttributes()
    // instead of an exact by.text(), which the incidental whitespace would break.
    await waitForText('angular-dimensions', text => /\d+×\d+/.test(text), 5_000);
    await waitForText('angular-keyboard', text => /keyboard (up|down)/.test(text), 5_000);
  });

  it('renders the Angular chips FlatList nested in the ScrollView', async () => {
    // angular-chips-list is one of the two FlatLists nested directly inside the outer
    // ScrollView — the anti-pattern the symbiote-detox-e2e skill documents as aggravating
    // Detox's upstream "not hittable" bug (wix/Detox#3130/#4747/#2229), already hit and
    // it.skip'd for angular-open-modal in probe.test.ts. Stick to toBeVisible (a `visible`
    // attribute the bug's own investigation showed still reports true) rather than a tap or an
    // internal scroll gesture on the list, which the investigation confirms can trip the
    // hittability pre-check even when the element is genuinely on-screen.
    await bringIntoView('angular-chips-list');
    await waitFor(element(by.id('angular-chips-list')))
      .toBeVisible()
      .withTimeout(5_000);
  });

  it('prepends items into the MVCP FlatList while the anchored item stays visible', async () => {
    // Same nested-FlatList caveat as chips-list above — angular-mvcp-list itself is only ever
    // queried for visibility here. The interaction lives on angular-mvcp-prepend-btn, a sibling
    // ActionButton OUTSIDE the FlatList (same tap depth as angular-counter-card, already proven
    // tappable in probe.test.ts), so tapping it doesn't touch the risky nested-list surface.
    await bringIntoView('angular-mvcp-list');
    await waitFor(element(by.text('item 0')))
      .toBeVisible()
      .withTimeout(10_000);

    await bringIntoView('angular-mvcp-prepend-btn');
    await element(by.id('angular-mvcp-prepend-btn')).tap();
    await sleep(300);

    // mvcpConfig's minIndexForVisible:0 anchors the item that was visible at prepend time —
    // "item 0" must stay on screen instead of the view jumping to hold the scroll OFFSET fixed
    // (which would instead push "item 0" down and reveal the 5 new rows above it). The newest
    // prepended row ("item -1", closest to the anchor) proves the data actually grew.
    await waitFor(element(by.text('item 0')))
      .toBeVisible()
      .withTimeout(10_000);
    await waitFor(element(by.text('item -1')))
      .toExist()
      .withTimeout(10_000);
  });

  it('keeps the native-driven parity header and scroll box responsive across a JS-thread freeze', async () => {
    await bringIntoView('angular-parity-header');
    await waitFor(element(by.id('angular-parity-scroll-box')))
      .toBeVisible()
      .withTimeout(10_000);

    await bringIntoView('angular-freeze-js-scroll-btn');
    await element(by.id('angular-freeze-js-scroll-btn')).tap();
    // freezeJsScroll() busy-loops the APP's JS thread for exactly 3s to prove the header/scroll
    // motion is UI-thread native-driven, not JS-driven — nothing observable changes during the
    // freeze by design, so there's no condition to poll here; wait past the known block instead.
    await sleep(3_500);

    // The app must still be alive and driving native UI after the freeze: the header/box are
    // still mounted, and a fresh scroll + safe-area check (same gate probe.test.ts uses for a
    // healthy screen) proves the JS thread resumed rather than staying wedged.
    await waitFor(element(by.id('angular-parity-header')))
      .toExist()
      .withTimeout(10_000);
    await waitFor(element(by.id('angular-parity-scroll-box')))
      .toExist()
      .withTimeout(10_000);
    await element(by.id('angular-canary-scroll')).scrollTo('top');
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });
});
