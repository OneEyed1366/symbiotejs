/**
 * @format
 *
 * Symbiote canary entry. Instead of AppRegistry.registerComponent (which runs
 * React Native's own renderer), we register a low-level runnable. The native
 * Fabric host calls it with the surface's rootTag; our renderer takes it from
 * there and drives nativeFabricUIManager directly via @symbiote/shared.
 */

import { AppRegistry, processColor, Image as RNImage } from 'react-native';
import { createElement } from 'react';
import { mount, setImageSourceResolver } from '@symbiote/react';
import { setColorProcessor } from '@symbiote/shared';
import App from './App';
import { name as appName } from './app.json';

// Diagnostic logs are off unless DEBUG=1 is set when Metro starts (babel inlines
// it). Mirror it onto the global so shared sees it on any host.
globalThis.__SYMBIOTE_DEBUG__ = process.env.DEBUG === '1';

// Colors reach Fabric as platform ints; let shared use RN's own converter.
setColorProcessor(processColor);

// require('./x.png') asset ids and {uri} sources are resolved by RN's own
// resolver before they reach Fabric, keeping @symbiote/react react-native-free.
setImageSourceResolver(source => RNImage.resolveAssetSource(source));

AppRegistry.registerRunnable(appName, appParameters => {
  mount(appParameters.rootTag, createElement(App));
});
