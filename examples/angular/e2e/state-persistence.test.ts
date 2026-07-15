import { by, device, element, waitFor } from 'detox';

// Journey coverage for StatePersistenceScreen (../screens/StatePersistenceScreen.ts), reached from
// the Menu's "State persistence" row. injectNavigationState reads the LIVE root-Stack state;
// "Serialize" JSON.stringifies serializeNavigatorState's output (an identity passthrough over
// INavigatorState -> `{ routes: [{key, name, params}, ...] }`, see
// packages/navigation/src/core/state-persistence/index.ts) into the snapshot signal, and
// "Restore" parses that JSON back through deserializeNavigatorState (which validates the shape,
// no blind cast) and calls navigation.reset() - a GENUINE navigation, not a display-only update.
// The reducer's 'reset' case (core/navigator-state/index.ts) replaces state with the deserialized
// object verbatim, route keys included, so restoring the snapshot JUST captured is a deterministic
// no-op: the Stack resets to the exact state it's already in, and re-serializing afterward
// reproduces byte-identical JSON. That round trip is the only restore path this suite drives.
//
// SKIPPED BY DESIGN: growing stack depth first (Menu -> DeepLinking -> back -> StatePersistence,
// serialize, compare depths) needs a way back to Menu, and the only one available is the native
// header back chevron, which carries no testID anywhere in this app - the exact gap
// hooks-demo.test.ts already documents and skips around. Restoring an arbitrarily-edited snapshot
// is also out of scope: it would navigate to whatever route the edit encodes, which this suite
// can't assert against without guessing.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Menu's 9 rows overflow the fold on the iPhone 17 simulator; StatePersistence is last (9 of 9),
// so it isn't hittable until scrolled into view. Same step-scroll pattern as probe.test.ts's
// bringIntoView (scoped to menu-scroll here, not angular-canary-scroll) - reset to the top first
// so this works regardless of prior scroll position, then step down checking visibility after
// each step, with a settle delay before the caller taps (RN momentum keeps drifting for a beat).
async function bringMenuRowIntoView(id: string): Promise<void> {
  const scrollView = element(by.id('menu-scroll'));
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

// Detox's waitFor has no text-predicate form, so poll getAttributes() until the testID's text
// matches. Same pattern as hooks-demo.test.ts's waitForText - needed here because both the
// placeholder->JSON and JSON->JSON (post-restore) transitions depend on an async
// press -> state update -> Fabric recommit round trip, and sync is off for this whole file.
// element(...).tap() runs Detox's own hittability pre-check, which deterministically misfires for
// ActionButton-composed targets (persist-serialize/persist-restore included) — traced to
// adapters/angular/src/primitives/shared.ts's anchorHostStyle mechanism: a composed Angular
// component (ActionButton wraps Pressable, both composed) creates a non-painting anchor host
// node ABOVE its real content, so a testID reached through two stacked anchors sits behind more
// native-view indirection than a bare `<Pressable>` (e.g. menu-row-*, which never hits this bug).
// device.tap(point) is a raw simulator-level tap with no element-matcher hittability check, so
// reading the element's real on-screen center via getAttributes().frame and tapping that point
// sidesteps it entirely (see the symbiote-detox-e2e skill, wix/Detox #3130/#4747/#2229).
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) throw new Error(`${id}: getAttributes() returned no frame`);
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

async function waitForText(id: string, matches: (text: string) => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await elementText(id);
    if (matches(last)) return;
    await sleep(250);
  }
  throw new Error(`${id} never matched within ${timeoutMs}ms; last text was "${last}"`);
}

const snapshotPlaceholder = 'tap Serialize to capture the current route stack as JSON';

describe('Angular State persistence demo', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
    // The first test scrolls immediately via bringMenuRowIntoView, whose first line is an
    // unguarded scrollTo('top') on menu-scroll — wait for the Menu screen's own ScrollView to
    // actually be laid out (real bounds, not zero-height) before that runs, or it races the
    // app's initial mount and throws. Same fix as canary-lists-scroll.test.ts's beforeAll.
    await waitFor(element(by.id('menu-scroll')))
      .toBeVisible()
      .withTimeout(10_000);
    await sleep(300);
  });

  it('navigates from the menu into the StatePersistence screen', async () => {
    await bringMenuRowIntoView('menu-row-StatePersistence');
    await element(by.id('menu-row-StatePersistence')).tap();
    await waitFor(element(by.id('persist-snapshot')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('shows the placeholder before anything has been serialized', async () => {
    await waitForText('persist-snapshot', text => text === snapshotPlaceholder, 5_000);
  });

  it('serializes the live root-Stack state into real JSON on Serialize', async () => {
    await deviceTap('persist-serialize');
    await waitForText(
      'persist-snapshot',
      text => text.includes('"routes"') && text.includes('"StatePersistence"'),
      5_000,
    );
  });

  it('round-trips the just-captured snapshot through Restore with no error, staying on this screen', async () => {
    const snapshotBeforeRestore = await elementText('persist-snapshot');

    await deviceTap('persist-restore');
    // Restoring the exact snapshot just captured resets the Stack to the state it's already in -
    // a deterministic no-op navigation-wise. A settle delay covers the reset -> recommit round
    // trip before asserting the screen (and its Serialize button) is still here. toExist(), not
    // toBeVisible() - persist-serialize is the same ActionButton-composed shape as the two taps
    // above, so its own geometry check is equally unreliable; existence is what actually proves
    // the screen didn't navigate away or throw.
    await sleep(500);
    await waitFor(element(by.id('persist-serialize')))
      .toExist()
      .withTimeout(5_000);

    // restoreError only renders its Text when set - if reset() had thrown or navigated away,
    // persist-serialize above would already be gone/stale. Re-serializing now proves the app is
    // still live AND that the round trip changed nothing: the reducer's 'reset' case replaces
    // state with the deserialized object verbatim (route keys included), so the freshly
    // re-captured snapshot must match the pre-restore one exactly.
    await deviceTap('persist-serialize');
    await waitForText('persist-snapshot', text => text === snapshotBeforeRestore, 5_000);
  });
});
