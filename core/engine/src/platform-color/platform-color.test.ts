// platform-color owns the color-processing seam: PlatformColor/DynamicColorIOS are pure
// constructors (no native dependency) and processColor/setColorProcessor are the injection
// point every color-touching module (commit's fabricProps, process-box-shadow, process-filter,
// process-background-image, StatusBar android) resolves a color through. This round-trips the
// pair directly against platform-color, independent of commit.ts, to prove the seam works when
// owned here rather than re-exported from commit.

import { afterEach, describe, expect, it } from 'vitest';
import { processColor, setColorProcessor } from './index';

describe('platform-color processColor / setColorProcessor', () => {
  afterEach(() => {
    // Restore the engine default (identity) so later tests never see a leaked processor.
    setColorProcessor(value => value);
  });

  it('runs a color through the injected processor', () => {
    setColorProcessor(value => (value === 'red' ? 0xff_00_00 : null));
    expect(processColor('red')).toBe(0xff_00_00);
  });

  it('defaults to identity when no processor has been installed', () => {
    expect(processColor('blue')).toBe('blue');
  });
});
