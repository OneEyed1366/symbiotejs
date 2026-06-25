// Timer globals provided by the Hermes/RN host but absent from the ES2022 lib.
// RN's setTimeout returns a numeric handle (not a NodeJS.Timeout).
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number
declare function clearTimeout(handle: number): void
