// Arithmetic / operator graph nodes: add, subtract, multiply, divide, modulo,
// diffClamp. Each composes one or two upstream values into a derived value.
// Ported from RN's AnimatedAddition / AnimatedSubtraction / AnimatedMultiplication
// / AnimatedDivision / AnimatedModulo / AnimatedDiffClamp, numeric path only.
//
// Each node is an AnimatedWithChildren: its OWN children array holds downstream
// consumers (wired by the base __connectNativeChildren), while its INPUTS are held
// separately and wired by registering this node as a child of each input at
// __attach (input.__addChild(this)). __getNativeConfig is creation-only: it reads
// each input's native tag (creating the input node) but issues no connect.

import { AnimatedNode, AnimatedWithChildren } from './graph';
import { AnimatedValue } from './value';
import { dlog } from '../debug';
import type { INativeNodeConfig, IPlatformConfig } from './native/native-animated';

// Wrap a bare number in an AnimatedValue so every input is a graph node.
function toNode(input: AnimatedNode | number): AnimatedNode {
  return typeof input === 'number' ? new AnimatedValue(input) : input;
}

function numericValue(node: AnimatedNode): number {
  const value = node.__getValue();
  if (typeof value !== 'number') {
    throw new Error('Animated operator input did not resolve to a number');
  }
  return value;
}

// Shared shape of add/subtract/multiply/divide: two operand nodes, wired into the
// graph identically (attach/detach both as children, makeNative both natively).
// Each subclass supplies only its arithmetic (`compute`) and its native config type.
abstract class AnimatedBinaryOp extends AnimatedWithChildren {
  protected readonly a: AnimatedNode;
  protected readonly b: AnimatedNode;

  constructor(a: AnimatedNode | number, b: AnimatedNode | number) {
    super();
    this.a = toNode(a);
    this.b = toNode(b);
  }

  protected abstract compute(a: number, b: number): number;

  override __getValue(): number {
    return this.compute(numericValue(this.a), numericValue(this.b));
  }

  override __attach(): void {
    this.a.__addChild(this);
    this.b.__addChild(this);
    super.__attach();
  }

  override __detach(): void {
    this.a.__removeChild(this);
    this.b.__removeChild(this);
    super.__detach();
  }

  override __makeNative(platformConfig?: IPlatformConfig): void {
    this.a.__makeNative(platformConfig);
    this.b.__makeNative(platformConfig);
    super.__makeNative(platformConfig);
  }
}

export class AnimatedAddition extends AnimatedBinaryOp {
  protected override compute(a: number, b: number): number {
    return a + b;
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'addition', input: [this.a.__getNativeTag(), this.b.__getNativeTag()] };
  }
}

export class AnimatedSubtraction extends AnimatedBinaryOp {
  protected override compute(a: number, b: number): number {
    return a - b;
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'subtraction', input: [this.a.__getNativeTag(), this.b.__getNativeTag()] };
  }
}

export class AnimatedMultiplication extends AnimatedBinaryOp {
  protected override compute(a: number, b: number): number {
    return a * b;
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'multiplication', input: [this.a.__getNativeTag(), this.b.__getNativeTag()] };
  }
}

export class AnimatedDivision extends AnimatedBinaryOp {
  private warnedAboutDivideByZero = false;

  constructor(a: AnimatedNode | number, b: AnimatedNode | number) {
    super(a, b);
    if (b === 0 || (b instanceof AnimatedNode && b.__getValue() === 0)) {
      dlog('AnimatedDivision: detected potential division by zero');
    }
  }

  protected override compute(a: number, b: number): number {
    if (b === 0) {
      // A divide-by-zero yields Infinity/NaN, which crashes Fabric, so clamp to 0.
      if (!this.warnedAboutDivideByZero) {
        dlog('AnimatedDivision: detected division by zero');
        this.warnedAboutDivideByZero = true;
      }
      return 0;
    }
    this.warnedAboutDivideByZero = false;
    return a / b;
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'division', input: [this.a.__getNativeTag(), this.b.__getNativeTag()] };
  }
}

export class AnimatedModulo extends AnimatedWithChildren {
  private readonly a: AnimatedNode;
  private readonly modulus: number;

  constructor(a: AnimatedNode, modulus: number) {
    super();
    this.a = a;
    this.modulus = modulus;
  }

  // Euclidean modulo: always lands in [0, modulus), unlike JS % which keeps the
  // dividend's sign.
  override __getValue(): number {
    const a = numericValue(this.a);
    return ((a % this.modulus) + this.modulus) % this.modulus;
  }

  override __attach(): void {
    this.a.__addChild(this);
    super.__attach();
  }

  override __detach(): void {
    this.a.__removeChild(this);
    super.__detach();
  }

  override __makeNative(platformConfig?: IPlatformConfig): void {
    this.a.__makeNative(platformConfig);
    super.__makeNative(platformConfig);
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'modulus', input: this.a.__getNativeTag(), modulus: this.modulus };
  }
}

export class AnimatedDiffClamp extends AnimatedWithChildren {
  private readonly a: AnimatedNode;
  private readonly min: number;
  private readonly max: number;
  private value: number;
  private lastValue: number;

  constructor(a: AnimatedNode, min: number, max: number) {
    super();
    this.a = a;
    this.min = min;
    this.max = max;
    this.value = numericValue(a);
    this.lastValue = this.value;
  }

  // Accumulate the input's frame-to-frame DELTA and clamp the running total to
  // [min, max]. The output tracks the input but never drifts past the band: the
  // classic collapsing-header pattern.
  override __getValue(): number {
    const value = numericValue(this.a);
    const diff = value - this.lastValue;
    this.lastValue = value;
    this.value = Math.min(Math.max(this.value + diff, this.min), this.max);
    return this.value;
  }

  override __attach(): void {
    this.a.__addChild(this);
    super.__attach();
  }

  override __detach(): void {
    this.a.__removeChild(this);
    super.__detach();
  }

  override __makeNative(platformConfig?: IPlatformConfig): void {
    this.a.__makeNative(platformConfig);
    super.__makeNative(platformConfig);
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'diffclamp', input: this.a.__getNativeTag(), min: this.min, max: this.max };
  }
}

export function add(a: AnimatedNode | number, b: AnimatedNode | number): AnimatedAddition {
  return new AnimatedAddition(a, b);
}

export function subtract(a: AnimatedNode | number, b: AnimatedNode | number): AnimatedSubtraction {
  return new AnimatedSubtraction(a, b);
}

export function multiply(
  a: AnimatedNode | number,
  b: AnimatedNode | number,
): AnimatedMultiplication {
  return new AnimatedMultiplication(a, b);
}

export function divide(a: AnimatedNode | number, b: AnimatedNode | number): AnimatedDivision {
  return new AnimatedDivision(a, b);
}

export function modulo(a: AnimatedNode, modulus: number): AnimatedModulo {
  return new AnimatedModulo(a, modulus);
}

export function diffClamp(a: AnimatedNode, min: number, max: number): AnimatedDiffClamp {
  return new AnimatedDiffClamp(a, min, max);
}
