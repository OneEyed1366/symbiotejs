// PlatformColor / DynamicColorIOS: opaque color values the native side resolves
// (iOS UIColor: semantic system colors and appearance-aware light/dark tuples).
// These are pure object constructors with no native dependency, so they live in
// shared and every adapter re-exports them. The opaque shape ({ semantic } /
// { dynamic }) is exactly what RN's processColor and the iOS RCTConvert UIColor
// path read, so our commit-time color seam routes these objects through the
// injected processor just like CSS-string colors (see commit.ts processValue).

// A light/dark/contrast branch accepts any color the processor understands: a
// CSS string, a platform int, or another opaque color.
export interface IDynamicColorIOSTuple {
  light: IColorValue;
  dark: IColorValue;
  highContrastLight?: IColorValue;
  highContrastDark?: IColorValue;
}

// An opaque color the native side resolves: `semantic` names platform colors
// (e.g. 'systemBlue', 'labelColor'); `dynamic` carries an appearance-aware tuple.
// Exactly one branch is populated by the constructors below.
export interface IOpaqueColorValue {
  readonly semantic?: readonly string[];
  readonly dynamic?: {
    readonly light: IColorValue;
    readonly dark: IColorValue;
    readonly highContrastLight?: IColorValue;
    readonly highContrastDark?: IColorValue;
  };
}

// What a color-valued style prop accepts: a CSS string or an opaque platform color.
export type IColorValue = string | IOpaqueColorValue;

export function PlatformColor(...names: string[]): IOpaqueColorValue {
  return { semantic: names };
}

export function DynamicColorIOS(tuple: IDynamicColorIOSTuple): IOpaqueColorValue {
  return {
    dynamic: {
      light: tuple.light,
      dark: tuple.dark,
      highContrastLight: tuple.highContrastLight,
      highContrastDark: tuple.highContrastDark,
    },
  };
}

// True for the opaque objects above: the color seam uses this to route them
// through the platform processor alongside CSS-string colors.
export function isOpaqueColorValue(value: unknown): value is IOpaqueColorValue {
  return typeof value === 'object' && value !== null && ('semantic' in value || 'dynamic' in value);
}

// Color props must reach Fabric as platform ints, not CSS strings. Fabric's C++ color
// parser silently drops strings. The actual conversion (processColor) is RN-platform-specific,
// so it is injected here rather than imported, keeping shared free of a react-native dependency
// (and the headless harness working). This module is the sole owner of "run a value through the
// platform color processor" - every color-touching consumer (commit's fabricProps,
// process-box-shadow, process-filter, process-background-image, StatusBar android) imports
// processColor/isProcessableColor from here, never from commit.ts.
let colorProcessor: (value: IColorValue) => unknown = value => value;

export function setColorProcessor(process: (value: IColorValue) => unknown): void {
  colorProcessor = process;
}

// Public mirror of RN's processColor: run a color through the injected platform processor (the
// canary wires RN's own). Off a real host it resolves CSS strings and opaque PlatformColor
// objects to the platform ints Fabric expects; headless (no processor wired) it is the identity,
// so smokes see the input unchanged.
export function processColor(color: IColorValue): unknown {
  return colorProcessor(color);
}

// A color-keyed value the platform processor must convert before Fabric: a CSS string, or an
// opaque PlatformColor / DynamicColorIOS object. Numbers (already platform ints) and undefined
// are left untouched.
export function isProcessableColor(value: unknown): value is IColorValue {
  return typeof value === 'string' || isOpaqueColorValue(value);
}
