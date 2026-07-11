// AnimatedParityDemo — ValueXY+PanResponder drag box, tracking (spring chase), diffClamp
// collapsing header. The Angular twin of examples/vue-sfc/components/AnimatedParityDemo.vue and
// the reference React AnimatedParityDemo section.
//
// Angular templates compile bindings ahead of time — there is no JSX `{...spread}` /
// `v-bind="obj"` equivalent for a custom element — so `panResponder.panHandlers` (an
// IGestureResponderHandlers bag: onStartShouldSetResponder / onResponderMove / ...) is forwarded
// through AnimatedView's own `[animatedProps]` escape hatch (see
// adapters/angular/src/modules/animated/create-animated-component.ts) instead of a spread.
//
// AnimatedView is imported as a direct named symbol (see AnimatedDemo.ts for why: ngtsc's
// partial-mode static evaluator can't trace a component class through property access on the
// external `Animated` namespace object — only a direct named import survives real AOT).

import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  Animated,
  AnimatedView,
  Button,
  PanResponder,
  Text,
  View,
} from '@symbiote-native/angular';

// static look compiled at build time by @symbiote-native/css-parser
import './AnimatedParityDemo.css';

const XY_SPAN = 96;
const TRACK_DISTANCE = 200;
const HEADER_COLLAPSE = 60;
const DRAG_MAX = XY_SPAN - 12;
const MOVE_DURATION_MS = 700;
const SCROLL_DURATION_MS = 180;

@Component({
  selector: 'AnimatedParityDemo',
  standalone: true,
  imports: [View, Text, Button, AnimatedView],
  template: `
    <View class="section">
      <Text class="section-label">Animated · ValueXY / tracking / diffClamp</Text>

      <Text class="drag-hint">drag the purple box →</Text>
      <View class="xy-frame">
        <AnimatedView
          testID="xy-box"
          [animatedProps]="panResponder.panHandlers"
          class="xy-box"
          [style]="{ transform: xy.getTranslateTransform() }"
        ></AnimatedView>
      </View>

      <View class="track-row">
        <AnimatedView
          testID="lead-dot"
          class="lead-dot"
          [style]="{ transform: [{ translateX: lead }] }"
        ></AnimatedView>
      </View>
      <View class="track-row">
        <AnimatedView
          testID="follow-dot"
          class="follow-dot"
          [style]="{ transform: [{ translateX: follow }] }"
        ></AnimatedView>
      </View>
      <Button
        testID="track-btn"
        title="Move target (follower chases)"
        (press)="moveLead()"
        color="#4299e1"
      ></Button>

      <View class="collapse-frame">
        <AnimatedView
          testID="collapse-header"
          class="collapse-header"
          [style]="{ transform: [{ translateY: headerOffset }] }"
        >
          <Text class="collapse-header-text">collapsing header</Text>
        </AnimatedView>
      </View>
      <View class="row-tight">
        <View class="flex-1">
          <Button
            testID="scroll-down-btn"
            title="Scroll ↓"
            (press)="scrollBy(40)"
            color="#38b2ac"
          ></Button>
        </View>
        <View class="flex-1">
          <Button
            testID="scroll-up-btn"
            title="Scroll ↑"
            (press)="scrollBy(-40)"
            color="#38b2ac"
          ></Button>
        </View>
      </View>
    </View>
  `,
})
export class AnimatedParityDemo implements OnInit, OnDestroy {
  // --- ValueXY + PanResponder: drag the box, clamped inside the frame -------------------------
  readonly xy = new Animated.ValueXY({ x: 0, y: 0 });
  private readonly restingPos = { x: 0, y: 0 };

  private clamp(value: number): number {
    return Math.max(0, Math.min(DRAG_MAX, value));
  }

  readonly panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_event, gesture) => {
      this.xy.setValue({
        x: this.clamp(this.restingPos.x + gesture.dx),
        y: this.clamp(this.restingPos.y + gesture.dy),
      });
    },
    onPanResponderRelease: (_event, gesture) => {
      this.restingPos.x = this.clamp(this.restingPos.x + gesture.dx);
      this.restingPos.y = this.clamp(this.restingPos.y + gesture.dy);
    },
  });

  // --- Tracking: a follower spring-chases a lead value that animates on tap -------------------
  readonly lead = new Animated.Value(0);
  readonly follow = new Animated.Value(0);
  private leadForward = false;

  readonly moveLead = (): void => {
    Animated.timing(this.lead, {
      toValue: this.leadForward ? 0 : TRACK_DISTANCE,
      duration: MOVE_DURATION_MS,
      useNativeDriver: false,
    }).start();
    this.leadForward = !this.leadForward;
  };

  // --- diffClamp: a header that collapses as you scroll down, reveals on up ------------------
  private readonly scroll = new Animated.Value(0);
  private scrollPos = 0;
  readonly headerOffset = Animated.diffClamp(this.scroll, 0, HEADER_COLLAPSE).interpolate({
    inputRange: [0, HEADER_COLLAPSE],
    outputRange: [0, -HEADER_COLLAPSE],
  });

  readonly scrollBy = (delta: number): void => {
    this.scrollPos = Math.max(0, this.scrollPos + delta);
    Animated.timing(this.scroll, {
      toValue: this.scrollPos,
      duration: SCROLL_DURATION_MS,
      useNativeDriver: false,
    }).start();
  };

  ngOnInit(): void {
    // Set up once: follow tracks lead. Every lead change re-aims the spring, so the follower
    // lags and chases rather than jumping, the tracking signature.
    Animated.spring(this.follow, { toValue: this.lead, useNativeDriver: false }).start();
  }

  ngOnDestroy(): void {
    this.follow.stopAnimation();
  }
}
