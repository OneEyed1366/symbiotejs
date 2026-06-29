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
