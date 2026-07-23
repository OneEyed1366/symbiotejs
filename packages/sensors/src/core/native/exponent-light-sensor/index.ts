// Base resolution for plain Node/vitest imports of './native/exponent-light-sensor', which
// don't go through Metro's platform-extension picking — re-exports the iOS stub so headless
// resolution stays side-effect-free and never calls requireNativeModule() outside a real RN
// runtime. Metro still picks index.ios.ts/index.android.ts per real platform at bundle time.
export { exponentLightSensor } from './index.ios';
