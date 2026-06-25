// Runtime globals provided by the Hermes/RN host but absent from the ES2022 lib.
declare function queueMicrotask(callback: () => void): void

declare function setTimeout(handler: () => void, timeout?: number): number
declare function clearTimeout(handle: number | undefined): void

declare const console: {
  log(...args: unknown[]): void
}

declare const process: {
  env: Record<string, string | undefined>
}
