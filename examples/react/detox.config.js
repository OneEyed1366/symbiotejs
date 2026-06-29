/**
 * Detox e2e config for the React canary (decision 0025; plan: .docs/detox-bring-up-plan.md).
 * Detox attaches at the stock RN host, below the renderer symbiote replaces, so this is the
 * same wiring any RN app uses. Two configurations: ios.sim.debug (the short go/no-go loop) and
 * android.emu.debug. The test JS runs on the host machine; the app side is native-only.
 * @type {Detox.DetoxConfig}
 */
module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js', _: ['e2e'] } },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/Canary.app',
      build:
        'xcodebuild -workspace ios/Canary.xcworkspace -UseNewBuildSystem=NO -scheme Canary -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
      start: 'react-native start',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android ; ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug ; cd -',
      // Detox runs this app `start` script to launch Metro (same as ios.debug); without it the
      // emulator hits RN's "Unable to load script" because no packager is serving the bundle.
      // reversePorts maps the device's localhost:8081 to the host Metro (adb reverse, automatic).
      start: 'react-native start',
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 17' } },
    emulator: {
      type: 'android.emulator',
      // avdName must match a local AVD (`emulator -list-avds`); it is machine-specific.
      device: { avdName: 'Pixel_9a' },
      reversePorts: [8081],
    },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
