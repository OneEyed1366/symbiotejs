// AnimatedInterpolation: a graph node that maps its parent's numeric value
// through an interpolation. Ported from RN's AnimatedInterpolation.js: numeric,
// string-with-units, and color output ranges (the value graph; native config
// removed). Platform (Native) colors stay out of scope, color.ts defers them.

import { AnimatedNode, AnimatedWithChildren, registerInterpolationFactory } from './graph';
import { checkValidRanges, createInterpolation, type IInterpolationConfig } from './interpolation';
import type { INativeNodeConfig, IPlatformConfig } from './native/native-animated';

export class AnimatedInterpolation extends AnimatedWithChildren {
  private readonly parent: AnimatedNode;
  private readonly config: IInterpolationConfig;
  private interpolation: ((input: number) => number | string) | undefined;

  constructor(parent: AnimatedNode, config: IInterpolationConfig) {
    super();
    this.parent = parent;
    this.config = config;
    // Validate eagerly so a bad range fails at construction, not first frame.
    checkValidRanges(config.inputRange, config.outputRange);
  }

  private getInterpolation(): (input: number) => number | string {
    if (this.interpolation === undefined) {
      this.interpolation = createInterpolation(this.config);
    }
    return this.interpolation;
  }

  override __getValue(): number | string {
    const parentValue = this.parent.__getValue();
    if (typeof parentValue !== 'number') {
      throw new Error('Cannot interpolate an input which is not a number');
    }
    return this.getInterpolation()(parentValue);
  }

  override __attach(): void {
    this.parent.__addChild(this);
    super.__attach();
  }

  override __detach(): void {
    this.parent.__removeChild(this);
    super.__detach();
  }

  // Make the upstream value native first, so the parent->interpolation edge can be
  // wired when this node is reached from a leaf rather than from the value.
  override __makeNative(platformConfig?: IPlatformConfig): void {
    this.parent.__makeNative(platformConfig);
    super.__makeNative(platformConfig);
  }

  override __getNativeConfig(): INativeNodeConfig {
    return {
      type: 'interpolation',
      inputRange: this.config.inputRange,
      outputRange: this.config.outputRange,
      extrapolateLeft: this.config.extrapolateLeft ?? this.config.extrapolate ?? 'extend',
      extrapolateRight: this.config.extrapolateRight ?? this.config.extrapolate ?? 'extend',
    };
  }
}

// Hand graph.ts's AnimatedNode.interpolate() the real constructor at module load,
// so every node subclass's base-class interpolate() produces an actual
// AnimatedInterpolation without graph.ts ever value-importing this module.
registerInterpolationFactory((parent, config) => new AnimatedInterpolation(parent, config));
