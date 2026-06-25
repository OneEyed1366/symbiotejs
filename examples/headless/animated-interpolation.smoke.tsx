// Headless proof of AnimatedInterpolation's non-numeric output ranges: a
// value-with-units string range interpolates the number and re-appends the unit,
// and a color range interpolates channel-wise and emits an rgba() string in RN's
// format (r,g,b rounded, alpha continuous). Mirrors RN AnimatedInterpolation.js's
// createStringInterpolation. The scalar number->number path stays untouched.

import { AnimatedValue } from '@symbiote/engine'

// ---- string-with-units: '0deg' -> '360deg' --------------------------------

const deg = new AnimatedValue(0.5).interpolate({
  inputRange: [0, 1],
  outputRange: ['0deg', '360deg'],
})
if (deg.__getValue() !== '180deg') {
  throw new Error(`deg interpolation at 0.5 should be '180deg', got ${String(deg.__getValue())}`)
}

// Endpoints and a fractional unit template ('1.5rad' style) keep their shape.
const rad = new AnimatedValue(1).interpolate({
  inputRange: [0, 1],
  outputRange: ['1.5rad', '3rad'],
})
if (rad.__getValue() !== '3rad') {
  throw new Error(`rad endpoint should be '3rad', got ${String(rad.__getValue())}`)
}

// A multi-number template (percent) interpolates each token in place.
const percent = new AnimatedValue(0.25).interpolate({
  inputRange: [0, 1],
  outputRange: ['0%', '100%'],
})
if (percent.__getValue() !== '25%') {
  throw new Error(`percent at 0.25 should be '25%', got ${String(percent.__getValue())}`)
}

// ---- color: ['#000000','#ffffff'] -> mid-gray rgba() ----------------------

const gray = new AnimatedValue(0.5).interpolate({
  inputRange: [0, 1],
  outputRange: ['#000000', '#ffffff'],
})
// (255 * 0.5) rounds to 128 per channel; alpha stays 1.
if (gray.__getValue() !== 'rgba(128, 128, 128, 1)') {
  throw new Error(`#000->#fff at 0.5 should be 'rgba(128, 128, 128, 1)', got ${String(gray.__getValue())}`)
}

// rgba() inputs interpolate channels AND continuous alpha.
const fade = new AnimatedValue(0.5).interpolate({
  inputRange: [0, 1],
  outputRange: ['rgba(0, 0, 0, 0)', 'rgba(100, 200, 40, 1)'],
})
if (fade.__getValue() !== 'rgba(50, 100, 20, 0.5)') {
  throw new Error(`rgba fade at 0.5 should be 'rgba(50, 100, 20, 0.5)', got ${String(fade.__getValue())}`)
}

// ---- scalar path unchanged ------------------------------------------------

const scalar = new AnimatedValue(0.5).interpolate({ inputRange: [0, 1], outputRange: [0, 100] })
if (scalar.__getValue() !== 50) {
  throw new Error(`scalar interpolation at 0.5 should be 50, got ${String(scalar.__getValue())}`)
}

console.log('deg/percent/color:', deg.__getValue(), percent.__getValue(), gray.__getValue(), fade.__getValue())
console.log('animated-interpolation.smoke OK')
