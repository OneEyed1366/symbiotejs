// Runtime global provided by the Hermes/RN host but absent from the ES2022 lib this package
// builds against (no DOM, no @types/node - see core/engine/src/globals.d.ts's identical
// declaration, which this package's own tsconfig scope doesn't inherit).
declare function queueMicrotask(callback: () => void): void;
