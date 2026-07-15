// A true module-level singleton — the whole point of createTunnel is that it's importable
// from a genuinely different surface, unlike Teleport's target ref. Used by
// screens/CanaryScreen.tsx's "Show toast (createTunnel)" demo.
import { createTunnel } from '@symbiote-native/vue';

export const tunnelDemo = createTunnel();
