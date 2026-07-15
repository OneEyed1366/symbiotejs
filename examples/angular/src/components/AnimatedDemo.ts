// AnimatedDemo — native vs JS driver, pulse + two slides + freeze-JS proof. The Angular twin of
// examples/vue-sfc/components/AnimatedDemo.vue and the reference React AnimatedDemo section.
//
// AnimatedView is imported as a direct named symbol, NOT `const AnimatedView = Animated.View`:
// ngtsc's partial-mode static evaluator (real AOT) can't trace a component class through property
// access on `Animated` (an external, pre-compiled namespace object) — only through a direct named
// import binding — so the dotted alias fails real `ngc` with NG1010 the moment this file enters an
// ngc program, even though it type-checks fine under plain tsc. `@symbiote-native/angular` exports
// `AnimatedView`/`AnimatedText`/`AnimatedImage`/`AnimatedScrollView` as top-level named symbols for
// exactly this reason.

import { Component, OnDestroy, OnInit } from '@angular/core';
import { Animated, AnimatedView, Button, Text, View } from '@symbiote-native/angular';
// Static look lives in AnimatedDemo.css — compiled at build time by @symbiote-native/css-parser.
import './AnimatedDemo.css';

const PULSE_DURATION_MS = 1400;
const SLIDE_DURATION_MS = 600;
const SLIDE_DISTANCE = 220;
const FREEZE_MS = 1500;

@Component({
  selector: 'AnimatedDemo',
  standalone: true,
  imports: [View, Text, Button, AnimatedView],
  template: `
    <View class="section">
      <Text class="section-label">Animated · JS vs native driver</Text>

      <View class="pulse-frame">
        <AnimatedView
          testID="pulse-dot"
          class="pulse-dot"
          [style]="{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }"
        ></AnimatedView>
      </View>

      <View class="slide-track">
        <AnimatedView
          testID="slide-js-dot"
          class="js-slide-dot"
          [style]="{ transform: [{ translateX: jsX }] }"
        ></AnimatedView>
      </View>
      <Button
        testID="slide-js-btn"
        title="Slide (JS driver)"
        (press)="slideJsDriver()"
        color="#dd0031"
      ></Button>

      <View class="slide-track">
        <AnimatedView
          testID="slide-native-dot"
          class="native-slide-dot"
          [style]="{ transform: [{ translateX: nativeX }] }"
        ></AnimatedView>
      </View>
      <Button
        testID="slide-native-btn"
        title="Slide (native driver)"
        (press)="slideNativeDriver()"
        color="#68d391"
      ></Button>

      <Button
        testID="freeze-js-btn"
        title="Freeze JS 1.5s"
        (press)="freezeJs()"
        color="#fc8181"
      ></Button>
    </View>
  `,
})
export class AnimatedDemo implements OnInit, OnDestroy {
  private readonly pulse = new Animated.Value(0);
  private readonly jsSlide = new Animated.Value(0);
  private readonly nativeSlide = new Animated.Value(0);
  private jsForward = false;
  private nativeForward = false;
  private animation: ReturnType<typeof Animated.loop> | undefined;

  readonly pulseScale = this.pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.3, 1],
  });
  readonly pulseOpacity = this.pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1, 0.4],
  });
  readonly jsX = this.jsSlide.interpolate({ inputRange: [0, 1], outputRange: [0, SLIDE_DISTANCE] });
  readonly nativeX = this.nativeSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });

  ngOnInit(): void {
    this.animation = Animated.loop(
      Animated.timing(this.pulse, { toValue: 1, duration: PULSE_DURATION_MS, useNativeDriver: true }),
    );
    this.animation.start();
  }

  ngOnDestroy(): void {
    this.animation?.stop();
  }

  private slide(
    value: InstanceType<typeof Animated.Value>,
    forward: boolean,
    setForward: (next: boolean) => void,
    useNativeDriver: boolean,
  ): void {
    Animated.timing(value, {
      toValue: forward ? 0 : 1,
      duration: SLIDE_DURATION_MS,
      useNativeDriver,
    }).start();
    setForward(!forward);
  }

  readonly slideJsDriver = (): void => {
    this.slide(
      this.jsSlide,
      this.jsForward,
      next => {
        this.jsForward = next;
      },
      false,
    );
  };

  readonly slideNativeDriver = (): void => {
    this.slide(
      this.nativeSlide,
      this.nativeForward,
      next => {
        this.nativeForward = next;
      },
      true,
    );
  };

  // Proof of offload: kick both slides, then jam the JS thread for 1.5s. The
  // native-driven pulse + green slide keep moving on the UI side through the freeze; the
  // JS-driven orange slide stalls until the thread is released.
  readonly freezeJs = (): void => {
    this.slide(
      this.jsSlide,
      this.jsForward,
      next => {
        this.jsForward = next;
      },
      false,
    );
    this.slide(
      this.nativeSlide,
      this.nativeForward,
      next => {
        this.nativeForward = next;
      },
      true,
    );
    const until = Date.now() + FREEZE_MS;
    while (Date.now() < until) {
      // Intentionally block the JS thread: no requestAnimationFrame can fire here.
    }
  };
}
