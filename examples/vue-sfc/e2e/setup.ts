// Each test file owns its own device.launchApp() (the probe launches with newInstance + the
// detoxEnableSynchronization:0 arg the canary's perpetual heartbeat requires). A global warm-launch
// here would fire first with synchronization ON and hang on that infinite animation, so there is no
// shared launch. This file is the seam for future cross-suite setup only.
export {}
