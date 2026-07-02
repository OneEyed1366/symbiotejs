// A true module-level singleton — the whole point of createTunnel is that it's importable
// from a genuinely different surface, unlike Teleport's target ref (vue-adapter-directives
// skill). Twin of examples/vue-sfc/tunnel-demo.ts (its own package, its own file).
import { createTunnel } from '@symbiote/vue';

export const tunnelDemo = createTunnel();
