/**
 * @format
 *
 * Symbiote Angular canary entry. bootstrapApplication wires the native-host seams and RN's own
 * AppRegistry, then registers the root component — same entry point the other canaries use.
 */

import { bootstrapApplication } from '@symbiote-native/angular/bootstrap';
import { AppComponent } from './build/angular/src/App';
import { name as appName } from './app.json';

bootstrapApplication(AppComponent, { appName });
