// This package runs at build time under Node (inside a Metro transformer), not on the Hermes/RN
// host — but the base tsconfig's `lib` is ES2022 only (no DOM, no @types/node wired to this
// package), so `console` needs the same minimal ambient declaration `@symbiote/engine` uses.
declare const console: {
  warn(...args: unknown[]): void;
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
