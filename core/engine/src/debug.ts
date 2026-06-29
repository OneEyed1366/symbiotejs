// Opt-in diagnostic logging, off by default. Two switches, either flips it on:
//   - env: DEBUG=1, read natively under Node (headless smokes) and inlined into
//     the RN bundle by the canary's babel config.
//   - runtime: globalThis.__SYMBIOTE_DEBUG__ = true, an escape hatch for hosts
//     where the env isn't reachable.
// Production with neither set pays one property read per call and nothing else.

declare global {
  var __SYMBIOTE_DEBUG__: boolean | undefined;
}

function envEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.DEBUG === '1';
}

export function isDebug(): boolean {
  return globalThis.__SYMBIOTE_DEBUG__ === true || envEnabled();
}

export function dlog(message: string): void {
  if (isDebug()) console.log(`[symbiote] ${message}`);
}
