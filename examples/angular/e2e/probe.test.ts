import { by, device, element, waitFor } from 'detox';

// Go/no-go probe for the Angular canary. It proves the native RN host starts, the
// Angular adapter mounts through @symbiotejs/engine, and a Fabric view from the Angular
// template reaches the native hierarchy with its testID.
describe('Angular symbiote attach probe', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('renders the Angular root view through Fabric', async () => {
    await waitFor(element(by.id('angular-root')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders the Angular SafeAreaView container through Fabric', async () => {
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders Angular text content through Fabric', async () => {
    await waitFor(element(by.id('angular-badge')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an Angular Image component through Fabric', async () => {
    await waitFor(element(by.id('angular-image')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an additional Angular host intrinsic through Fabric', async () => {
    await waitFor(element(by.id('angular-spinner')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders the Angular Switch component through Fabric', async () => {
    await waitFor(element(by.id('angular-switch')))
      .toExist()
      .withTimeout(10_000);
  });

  it('recommits after an Angular press handler updates state', async () => {
    await element(by.id('angular-counter')).tap();
    await waitFor(element(by.text('tapped 1×')))
      .toExist()
      .withTimeout(10_000);
  });

  it('opens and closes an Angular Modal through Fabric', async () => {
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
    await element(by.id('angular-input')).typeText('hi');
    await waitFor(element(by.text('echo: hi')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an Angular ImageBackground with children on top', async () => {
    await waitFor(element(by.id('angular-image-bg-label')))
      .toExist()
      .withTimeout(10_000);
  });
});
