import { by, device, element, waitFor } from 'detox';

// First e2e coverage for HeaderOptionsScreen (screens/HeaderOptionsScreen.ts): a native header's
// bar buttons, a right-side UIMenu, headerLargeTitle, and the full headerSearchBarOptions surface
// driven imperatively through its SearchBarCommands ref (focus/setText/clearText/cancelSearch).
// Reached from the demo Menu ('menu-row-HeaderOptions'), twin of probe.test.ts's launch pattern.
//
// The bar-button/menu items are native RNSScreen header chrome, NOT Angular-rendered views - they
// carry no testID, only their `title` string, reachable as plain native accessibility text
// (no Angular interpolation involved, so none of the whitespace-preservation gotcha below applies
// to them). The body Text nodes ARE Angular-rendered, and every one of them interpolates its value
// across a multi-line `{{ }}` block - per the symbiote-detox-e2e skill, Angular's default
// preserveWhitespaces:false does NOT collapse a multi-line interpolation's surrounding whitespace,
// so an exact by.text() match against these would fail on indentation alone. elementText/
// waitForText below (ported from canary-journeys.test.ts) read the node's testID and its live text
// via getAttributes(), then assert with .includes(...) - immune to that whitespace either way.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Detox surfaces an element's text via getAttributes(). The return is a union - one element
// ({text,label,…}) or many ({elements:[…]}) - so narrow with `in` instead of casting.
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

// Poll an element's text until it matches (Detox waitFor has no text-predicate form). Every action
// in this file round-trips through a native onPress/onFocus/onChangeText callback into
// navigation.setParams() and back through injectRoute() before the Text node recommits - a bare
// expect right after a .tap() would race that, so every assertion below goes through this poll.
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

describe('Angular HeaderOptions screen', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the HeaderOptions screen', async () => {
    await waitFor(element(by.id('menu-row-HeaderOptions')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-HeaderOptions')).tap();
    await waitFor(element(by.id('header-last-action')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('fires the left bar button and round-trips the action through setParams', async () => {
    // Native UIBarButtonItem, accessibilityLabel = title - plain by.text, no testID available.
    await waitFor(element(by.text('Info')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Info')).tap();
    await waitForText('header-last-action', text => text.includes('left bar button: Info'), 10_000);
  });

  // Least-proven interaction in this file: 'More' opens a native UIMenu (iOS context menu), a
  // different presentation/hit-testing surface than a plain bar button. Trying the straightforward
  // by.text() path first per the task brief - if this proves flaky/unreachable, the verification
  // pass should downgrade it to it.skip with the same citation style as probe.test.ts's
  // angular-open-modal skip (symbiote-detox-e2e skill, wix/Detox #3130/#4747/#2229).
  it('opens the right bar-button menu and fires the Share action', async () => {
    await element(by.text('More')).tap();
    await waitFor(element(by.text('Share')))
      .toBeVisible()
      .withTimeout(5_000);
    await element(by.text('Share')).tap();
    await waitForText('header-last-action', text => text.includes('menu: Share'), 10_000);
  });

  // SKIPPED: search-bar-focus sits well inside the viewport (view bounds y=505 of an 874pt
  // screen, no ScrollView involved - HeaderOptionsScreen is a plain SafeAreaView/View per
  // symbiote-detox-e2e's diagnosis), yet Detox's own hittability pre-check reports it
  // non-hittable ("View is not visible around point") on its very first tap - the identical
  // elementFrame/visible-bounds signature as the confirmed upstream bug (wix/Detox #3130,
  // #4747, #2229; probe.test.ts's angular-open-modal skip). Ruled out as a settle-timing issue:
  // this is the fourth test in the file, run seconds after the initial navigation (headerLargeTitle
  // has long since resolved), and a raw mobile-mcp coordinate tap (bypassing Detox entirely)
  // confirms the button is genuinely on-screen and its onFocus callback fires correctly - the
  // same "reachable outside Detox, rejected by Detox's own pre-check" pattern as the precedent.
  // Not split into per-button tests: a raw coordinate tap round-trip through this screen's whole
  // headerSearchBarOptions button stack (focus/setText/clear) confirmed every button is equally
  // reachable/functional, meaning Detox's pre-check would very likely reject each one's own first
  // tap the same way search-bar-focus's did here - matching angular-open-modal's precedent of a
  // deterministic failure unaffected by settle delay or interaction ordering, not a one-off flake
  // splitting could route around. Re-enable once upstream fixes hittability for this class of
  // target, or downgrade to raw-coordinate taps if that becomes a supported Detox escape hatch.
  it.skip('drives the search bar imperatively through its SearchBarCommands ref', async () => {
    await waitFor(element(by.id('search-bar-focus')))
      .toBeVisible()
      .withTimeout(10_000);

    await element(by.id('search-bar-focus')).tap();
    await waitForText('header-search-event', text => text.includes('focused'), 10_000);

    await element(by.id('search-bar-set-text')).tap();
    // Proves setText fires the search bar's onChangeText callback, not just a visual native
    // update - if header-search-text never picks up 'preset value', that's a real product gap in
    // the SearchBarCommands wiring, not a test bug; report it rather than loosening this assert.
    await waitForText('header-search-text', text => text.includes('preset value'), 10_000);

    await element(by.id('search-bar-clear')).tap();
    // clearText's exact onChangeText payload (empty string vs no callback at all) isn't confirmed
    // from source - core/search-bar-commands.ts only shows the native view command being
    // dispatched, not react-native-screens' native-side behavior. Asserting the observable
    // contract that matters here (the stale 'preset value' readout is gone), not a specific empty
    // string - if it stays stuck on 'preset value', that's the behavior to report, not paper over.
    await waitForText('header-search-text', text => !text.includes('preset value'), 10_000);

    await element(by.id('search-bar-cancel')).tap();
    await waitForText('header-search-event', text => text.includes('cancel pressed'), 10_000);
  });
});
