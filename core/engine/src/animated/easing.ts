// Common easing functions, ported from React Native's Libraries/Animated/Easing.js.
// Pure math (the only dependency is the equally-pure bezier solver), so it lives
// unchanged in shared and every adapter re-exports it.

import { bezier } from './bezier';

export type IEasingFunction = (t: number) => number;

let cachedEase: IEasingFunction | undefined;

export const Easing = {
  // A stepping function: 1 for any positive n, else 0.
  step0(n: number): number {
    return n > 0 ? 1 : 0;
  },

  // A stepping function: 1 once n >= 1, else 0.
  step1(n: number): number {
    return n >= 1 ? 1 : 0;
  },

  // Linear, f(t) = t.
  linear(t: number): number {
    return t;
  },

  // A simple inertial interaction (object slowly accelerating to speed).
  ease(t: number): number {
    if (cachedEase === undefined) {
      cachedEase = bezier(0.42, 0, 1, 1);
    }
    return cachedEase(t);
  },

  // Quadratic, f(t) = t * t.
  quad(t: number): number {
    return t * t;
  },

  // Cubic, f(t) = t * t * t.
  cubic(t: number): number {
    return t * t * t;
  },

  // Nth-power: position is the Nth power of elapsed time.
  poly(n: number): IEasingFunction {
    return t => Math.pow(t, n);
  },

  // Sinusoidal.
  sin(t: number): number {
    return 1 - Math.cos((t * Math.PI) / 2);
  },

  // Circular.
  circle(t: number): number {
    return 1 - Math.sqrt(1 - t * t);
  },

  // Exponential.
  exp(t: number): number {
    return Math.pow(2, 10 * (t - 1));
  },

  // Elastic: spring-like oscillation. bounciness 1 overshoots once; 0 not at all.
  elastic(bounciness: number = 1): IEasingFunction {
    const p = bounciness * Math.PI;
    return t => 1 - Math.pow(Math.cos((t * Math.PI) / 2), 3) * Math.cos(t * p);
  },

  // Animates back slightly before moving forward.
  back(s: number = 1.70158): IEasingFunction {
    return t => t * t * ((s + 1) * t - s);
  },

  // A simple bouncing effect.
  bounce(t: number): number {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    }
    if (t < 2 / 2.75) {
      const t2 = t - 1.5 / 2.75;
      return 7.5625 * t2 * t2 + 0.75;
    }
    if (t < 2.5 / 2.75) {
      const t2 = t - 2.25 / 2.75;
      return 7.5625 * t2 * t2 + 0.9375;
    }
    const t2 = t - 2.625 / 2.75;
    return 7.5625 * t2 * t2 + 0.984375;
  },

  // A cubic bezier curve, same as CSS transition-timing-function.
  bezier(x1: number, y1: number, x2: number, y2: number): IEasingFunction {
    return bezier(x1, y1, x2, y2);
  },

  // Runs an easing function forwards.
  in(easing: IEasingFunction): IEasingFunction {
    return easing;
  },

  // Runs an easing function backwards.
  out(easing: IEasingFunction): IEasingFunction {
    return t => 1 - easing(1 - t);
  },

  // Makes any easing function symmetrical (forwards then backwards).
  inOut(easing: IEasingFunction): IEasingFunction {
    return t => {
      if (t < 0.5) {
        return easing(t * 2) / 2;
      }
      return 1 - easing((1 - t) * 2) / 2;
    };
  },
};
