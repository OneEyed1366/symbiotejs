// Angular source-import harness regression. Vitest imports adapter source (`src/*.ts`) directly,
// not the partial-Ivy `ngc` output Metro consumes. The adapter tsconfig must therefore enable
// TypeScript's legacy decorator lowering so Node never sees raw `@Component` / `@Directive`
// syntax. Importing `@angular/compiler` enables JIT metadata creation for these source-only tests;
// production still proves AOT/partial-Ivy through `pnpm --filter @symbiotejs/angular ng:build`.

import '@angular/compiler';
import { ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { Image, ScrollView, Text, View } from './components';
import { VirtualizedList, VListItemDirective } from './components/virtualized-list';
import { SymbioteHostPropsDirective } from './primitives';
import {
  Animated,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedText,
  AnimatedView,
  createAnimatedComponent,
} from './modules/animated';

interface IAngularCompiledComponent {
  ɵcmp?: { selectors?: unknown };
}

interface IAngularCompiledDirective {
  ɵdir?: { selectors?: unknown };
}

describe('Angular source imports under Vitest', () => {
  it('imports decorated adapter components and directives directly from src', () => {
    expect(VirtualizedList).toBeTypeOf('function');
    expect(VListItemDirective).toBeTypeOf('function');
    expect(AnimatedView).toBeTypeOf('function');
    expect(SymbioteHostPropsDirective).toBeTypeOf('function');
  });

  it('keeps Angular decorator metadata available to the JIT test runtime', () => {
    expect((VirtualizedList as IAngularCompiledComponent).ɵcmp?.selectors).toEqual([
      ['VirtualizedList'],
    ]);
    expect((AnimatedView as IAngularCompiledComponent).ɵcmp?.selectors).toEqual([
      ['AnimatedView'],
      ['symbiote-animated-view'],
    ]);
    expect((VListItemDirective as IAngularCompiledDirective).ɵdir?.selectors).toEqual([
      ['', 'vListItem', ''],
    ]);
    expect((SymbioteHostPropsDirective as IAngularCompiledDirective).ɵdir?.selectors).toEqual([
      ['', 'symbioteHostProps', ''],
    ]);
  });

  it('imports the Animated namespace without losing component identity', () => {
    expect(Animated.View).toBe(AnimatedView);
    expect(Animated.Text).toBe(AnimatedText);
    expect(Animated.Image).toBe(AnimatedImage);
    expect(Animated.ScrollView).toBe(AnimatedScrollView);
    expect(Animated.FlatList).toBeTypeOf('function');
    expect(Animated.SectionList).toBeTypeOf('function');
  });

  it('keeps createAnimatedComponent limited to pre-authored AOT-safe Angular wrappers', () => {
    class CustomComponent {}

    expect(createAnimatedComponent(View)).toBe(AnimatedView);
    expect(createAnimatedComponent(Text)).toBe(AnimatedText);
    expect(createAnimatedComponent(Image)).toBe(AnimatedImage);
    expect(createAnimatedComponent(ScrollView)).toBe(AnimatedScrollView);
    expect(() => createAnimatedComponent(CustomComponent)).toThrow(
      /Angular cannot synthesize a component at runtime \(no JIT compiler under AOT\/Metro\)/,
    );
    expect(() => createAnimatedComponent(CustomComponent)).toThrow(
      /Author an explicit standalone @Component extending AnimatedComponentBase instead/,
    );
  });

  it('resolves AnimatedImage props through the composed Image path', () => {
    // AnimatedImage is an ANCHOR_HOST_COMPONENT: its field initializer injects its own
    // ElementRef (anchorHostStyle merge, see create-animated-component.ts), so constructing it
    // outside Angular's component machinery needs an explicit injection context.
    const injector = Injector.create({
      providers: [{ provide: ElementRef, useValue: new ElementRef({}) }],
    });
    const image = runInInjectionContext(injector, () => new AnimatedImage());
    image.src = 'https://example.invalid/image.png';
    image.width = 32;
    image.height = 24;
    image.alt = 'Preview';
    image.animatedProps = { style: { opacity: 0.5 }, testID: 'animated-image' };

    expect(image.animatedImageProps).toMatchObject({
      testID: 'animated-image',
      accessible: true,
      accessibilityLabel: 'Preview',
      source: [{ uri: 'https://example.invalid/image.png' }],
      style: [undefined, [{ width: 32, height: 24 }, { opacity: 0.5 }]],
    });
  });
});
