// Cubic-bezier easing solver, ported verbatim from React Native's
// Libraries/Animated/bezier.js (originally bezier-easing by Gaëtan Renaudeau,
// MIT). Pure math (no React, no native), so it lives unchanged in shared.

// Established by empiricism (tradeoff: performance vs precision).
const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;

const SPLINE_TABLE_SIZE = 11;
const SAMPLE_STEP_SIZE = 1.0 / (SPLINE_TABLE_SIZE - 1.0);

function a(a1: number, a2: number): number {
  return 1.0 - 3.0 * a2 + 3.0 * a1;
}
function b(a1: number, a2: number): number {
  return 3.0 * a2 - 6.0 * a1;
}
function c(a1: number): number {
  return 3.0 * a1;
}

// x(t) given t, x1, x2, or y(t) given t, y1, y2.
function calcBezier(t: number, a1: number, a2: number): number {
  return ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t;
}

// dx/dt given t, x1, x2, or dy/dt given t, y1, y2.
function getSlope(t: number, a1: number, a2: number): number {
  return 3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c(a1);
}

function binarySubdivide(
  x: number,
  lower: number,
  upper: number,
  mX1: number,
  mX2: number,
): number {
  let currentX: number;
  let currentT: number;
  let lo = lower;
  let hi = upper;
  let i = 0;
  do {
    currentT = lo + (hi - lo) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - x;
    if (currentX > 0.0) {
      hi = currentT;
    } else {
      lo = currentT;
    }
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
}

function newtonRaphsonIterate(x: number, guess: number, mX1: number, mX2: number): number {
  let guessT = guess;
  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    const currentSlope = getSlope(guessT, mX1, mX2);
    if (currentSlope === 0.0) {
      return guessT;
    }
    const currentX = calcBezier(guessT, mX1, mX2) - x;
    guessT -= currentX / currentSlope;
  }
  return guessT;
}

export function bezier(mX1: number, mY1: number, mX2: number, mY2: number): (x: number) => number {
  if (!(mX1 >= 0 && mX1 <= 1 && mX2 >= 0 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  // Precompute the spline samples once.
  const sampleValues = new Array<number>(SPLINE_TABLE_SIZE);
  if (mX1 !== mY1 || mX2 !== mY2) {
    for (let i = 0; i < SPLINE_TABLE_SIZE; ++i) {
      sampleValues[i] = calcBezier(i * SAMPLE_STEP_SIZE, mX1, mX2);
    }
  }

  function getTForX(x: number): number {
    let intervalStart = 0.0;
    let currentSample = 1;
    const lastSample = SPLINE_TABLE_SIZE - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= x; ++currentSample) {
      intervalStart += SAMPLE_STEP_SIZE;
    }
    --currentSample;

    // Interpolate to provide an initial guess for t.
    const dist =
      (x - sampleValues[currentSample]) /
      (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    const guessForT = intervalStart + dist * SAMPLE_STEP_SIZE;

    const initialSlope = getSlope(guessForT, mX1, mX2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(x, guessForT, mX1, mX2);
    }
    if (initialSlope === 0.0) {
      return guessForT;
    }
    return binarySubdivide(x, intervalStart, intervalStart + SAMPLE_STEP_SIZE, mX1, mX2);
  }

  return function bezierEasing(x: number): number {
    if (mX1 === mY1 && mX2 === mY2) {
      return x; // linear
    }
    // JS numbers are imprecise; pin the extremes.
    if (x === 0) return 0;
    if (x === 1) return 1;
    return calcBezier(getTForX(x), mY1, mY2);
  };
}
