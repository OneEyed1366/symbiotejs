import {
  AnimatedProps,
  type AnimatedValue,
  dlog,
  isAnchor,
  reduceProps,
  routeProp,
  whenCommitted,
  createElement,
  appendChild,
  insertBefore,
  removeChild,
  type AnimatedInterpolation,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  createInitialStickyState,
  readLayoutNumber,
  reduceSticky,
  STICKY_HEADER_Z_INDEX,
  type IStickyAction,
  type IStickyEffect,
  type IStickyReducerInputs,
} from '@symbiote-native/components';
import { descriptorFor } from '@symbiote-native/components';
import { Platform } from '@symbiote-native/engine';

type IInsert = (parent: ISymbioteNode, child: ISymbioteNode, beforeChild?: ISymbioteNode) => void;
type IRemove = (parent: ISymbioteNode, child: ISymbioteNode) => void;

const contentProjection = new WeakMap<ISymbioteNode, ScrollViewProjectionController>();
const projectedWrappers = new WeakMap<ISymbioteNode, IProjectedRecord>();

interface IProjectedRecord {
  child: ISymbioteNode;
  wrapper: ISymbioteNode | undefined;
  sticky: StickyProjectionWrapper | undefined;
  stickyIndex: number | undefined;
}

export interface IScrollViewProjectionConfig {
  stickyHeaderIndices: readonly number[] | undefined;
  invertStickyHeaders: boolean | undefined;
  scrollViewHeight: number | undefined;
  scrollAnimatedValue: AnimatedValue;
  customStickyHeaderComponent: unknown;
  excludeRefreshControl: boolean;
}

function createViewNode(): ISymbioteNode {
  const descriptor = descriptorFor('symbiote-view');
  return createElement(descriptor.component, descriptor.isText);
}

function directNode(record: IProjectedRecord): ISymbioteNode {
  return record.wrapper ?? record.child;
}

function isProjectedRefreshControl(node: ISymbioteNode): boolean {
  if (node.component === 'PullToRefreshView' || node.component === 'AndroidSwipeRefreshLayout') {
    return true;
  }
  // Angular public <RefreshControl> is an anchor host whose real native refresh node lives inside
  // its component view. Projection filtering must recognize that anchor, otherwise iOS re-renders
  // a RefreshControl sibling and also leaves the projected one inside the scroll content.
  return isAnchor(node) && node.children.some(isProjectedRefreshControl);
}

// The SECOND Angular sticky effect-runner (auto-projected children can't be arbitrary Angular
// component classes, so the controller drives engine nodes directly). It shares the ONE
// reduceSticky state machine with ScrollViewStickyHeader — the DECISIONS (zero-swallow gate, debounce
// delay, rebuild ranges, cross-talk record) live there; this runner only EXECUTES the effects on the
// engine node (build interpolation + wire listener, hold the debounce timer, re-apply the node props).
// Because it owns the child index, it consumes the reducer's record-header-y effect for cross-talk.
class StickyProjectionWrapper {
  private readonly state = createInitialStickyState();
  private animatedTranslateY: AnimatedInterpolation;
  private interpolation: AnimatedInterpolation | undefined;
  private animatedProps: AnimatedProps | undefined;
  private cancelBind: (() => void) | undefined;
  private listenerId: string | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly controller: ScrollViewProjectionController,
    private readonly childIndex: number,
    private readonly node: ISymbioteNode,
  ) {
    this.animatedTranslateY = this.controller.config.scrollAnimatedValue.interpolate({
      inputRange: [-1, 0],
      outputRange: [0, 0],
    });
    this.dispatch({ kind: 'inputs-changed' });
  }

  destroy(): void {
    this.cancelBind?.();
    this.cancelBind = undefined;
    if (this.interpolation !== undefined && this.listenerId !== undefined) {
      this.interpolation.removeListener(this.listenerId);
      this.listenerId = undefined;
    }
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.animatedProps !== undefined) {
      this.animatedProps.__detach();
      this.animatedProps = undefined;
    }
  }

  // The controller calls this when a cross-talk input changed (a sibling recorded its y): rebuild the
  // ranges off the new nextStickyHeaderY.
  rebuild(): void {
    this.dispatch({ kind: 'inputs-changed' });
  }

  private inputs(): IStickyReducerInputs {
    return {
      os: Platform.OS,
      inverted: this.controller.config.invertStickyHeaders,
      scrollViewHeight: this.controller.config.scrollViewHeight,
      nextHeaderLayoutY: this.controller.nextStickyHeaderY(this.childIndex),
      index: this.childIndex,
    };
  }

  private dispatch(action: IStickyAction): void {
    this.runEffects(reduceSticky(this.state, action, this.inputs()).effects);
  }

  private runEffects(effects: IStickyEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'rebuild-interpolation': {
          if (this.interpolation !== undefined && this.listenerId !== undefined) {
            this.interpolation.removeListener(this.listenerId);
            this.listenerId = undefined;
          }
          const next = this.controller.config.scrollAnimatedValue.interpolate({
            inputRange: effect.inputRange,
            outputRange: effect.outputRange,
          });
          this.listenerId = next.addListener(this.animatedValueListener);
          this.interpolation = next;
          this.animatedTranslateY = next;
          this.applyProps();
          dlog(
            `Angular ScrollView projection sticky index=${this.childIndex} measured=${this.state.measured} y=${this.state.layoutY}`,
          );
          break;
        }
        case 'schedule-debounce':
          if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this.dispatch({ kind: 'debounce-fired', value: effect.value });
          }, effect.delay);
          break;
        case 'apply-passthrough':
          this.applyProps();
          break;
        case 'record-header-y':
          this.controller.recordHeaderLayoutY(effect.index, effect.y);
          break;
      }
    }
  }

  private readonly onLayout = (event: ISymbioteEvent): void => {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    // Keep the previous value when a field is absent (RN sets state only on a defined read).
    this.dispatch({
      kind: 'layout',
      y: y ?? this.state.layoutY,
      height: height ?? this.state.layoutHeight,
    });
  };

  private readonly animatedValueListener = ({ value }: { value: number | string }): void => {
    if (typeof value === 'number') this.dispatch({ kind: 'animated-tick', value });
  };

  private props(): Record<string, unknown> {
    const style = {
      transform: [{ translateY: this.animatedTranslateY }],
      zIndex: STICKY_HEADER_Z_INDEX,
    };
    const passthrough =
      this.state.translateY === null
        ? undefined
        : { transform: [{ translateY: this.state.translateY }], zIndex: STICKY_HEADER_Z_INDEX };
    return {
      style: passthrough === undefined ? style : [style, passthrough],
      onLayout: this.onLayout,
      collapsable: false,
    };
  }

  private applyProps(): void {
    const props = this.props();
    const reduced = reduceProps(props);
    for (const [key, value] of Object.entries(reduced)) routeProp(this.node, key, value);

    const next = new AnimatedProps(props);
    next.__attach();
    if (this.animatedProps !== undefined) this.animatedProps.__detach();
    this.animatedProps = next;
    this.cancelBind?.();
    this.cancelBind = whenCommitted(this.node, () => next.setNativeView(this.node));
  }
}

export class ScrollViewProjectionController {
  config: IScrollViewProjectionConfig;
  private contentNode: ISymbioteNode | undefined;
  private readonly records: IProjectedRecord[] = [];
  private readonly headerLayoutYs = new Map<number, number>();

  constructor(config: IScrollViewProjectionConfig) {
    this.config = config;
  }

  update(config: IScrollViewProjectionConfig): void {
    this.config = config;
    this.reconcileStickyRecords();
  }

  bindContentNode(node: ISymbioteNode): void {
    dlog(
      `Angular ScrollView projection bindContentNode node=${node.component} preExistingChildren=${node.children.length} recordsBefore=${this.records.length}`,
    );
    this.contentNode = node;
    contentProjection.set(node, this);
    if (this.records.length === 0 && node.children.length > 0) {
      for (const child of [...node.children]) {
        this.records.push({ child, wrapper: undefined, sticky: undefined, stickyIndex: undefined });
      }
    }
    this.reconcileStickyRecords();
  }

  appendProjectedChild(parent: ISymbioteNode, child: ISymbioteNode, insert: IInsert): void {
    dlog(
      `Angular ScrollView projection appendProjectedChild parent=${parent.component} child=${child.component} recordsBefore=${this.records.length}`,
    );
    const existing = this.records.find(record => record.child === child);
    if (existing !== undefined) this.records.splice(this.records.indexOf(existing), 1);
    const record: IProjectedRecord = {
      child,
      wrapper: undefined,
      sticky: undefined,
      stickyIndex: undefined,
    };
    this.records.push(record);
    this.insertRecord(parent, record, undefined, insert);
    this.reconcileStickyRecords();
  }

  insertProjectedChild(
    parent: ISymbioteNode,
    child: ISymbioteNode,
    beforeChild: ISymbioteNode | null,
    insert: IInsert,
  ): void {
    dlog(
      `Angular ScrollView projection insertProjectedChild parent=${parent.component} child=${child.component} before=${beforeChild ? `${beforeChild.component}` : 'null'} recordsBefore=${this.records.length}`,
    );
    const existing = this.records.find(record => record.child === child);
    if (existing !== undefined) this.records.splice(this.records.indexOf(existing), 1);
    const beforeRecord =
      beforeChild === null
        ? undefined
        : this.records.find(
            record => record.child === beforeChild || record.wrapper === beforeChild,
          );
    const record: IProjectedRecord = {
      child,
      wrapper: undefined,
      sticky: undefined,
      stickyIndex: undefined,
    };
    const index =
      beforeRecord === undefined ? this.records.length : this.records.indexOf(beforeRecord);
    this.records.splice(index, 0, record);
    this.insertRecord(parent, record, beforeRecord, insert);
    this.reconcileStickyRecords();
  }

  removeProjectedChild(child: ISymbioteNode, remove: IRemove): boolean {
    const record = this.records.find(entry => entry.child === child || entry.wrapper === child);
    if (record === undefined || this.contentNode === undefined) return false;
    record.sticky?.destroy();
    projectedWrappers.delete(record.child);
    const direct = directNode(record);
    if (direct.parent === this.contentNode) remove(this.contentNode, direct);
    this.records.splice(this.records.indexOf(record), 1);
    this.reconcileStickyRecords();
    return true;
  }

  nextStickyHeaderY(index: number): number | undefined {
    const stickyIndices = this.config.stickyHeaderIndices ?? [];
    const next = stickyIndices.find(entry => entry > index);
    return next === undefined ? undefined : this.headerLayoutYs.get(next);
  }

  recordHeaderLayoutY(index: number, y: number): void {
    if (this.headerLayoutYs.get(index) === y) return;
    this.headerLayoutYs.set(index, y);
    for (const record of this.records) record.sticky?.rebuild();
  }

  private insertRecord(
    parent: ISymbioteNode,
    record: IProjectedRecord,
    beforeRecord: IProjectedRecord | undefined,
    insert: IInsert,
  ): void {
    const before = beforeRecord === undefined ? undefined : directNode(beforeRecord);
    dlog(
      `Angular ScrollView projection insertRecord physicalParent=${parent.component} child=${record.child.component} before=${before ? before.component : 'undefined(append)'} parentIsContentNode=${parent === this.contentNode}`,
    );
    if (before === undefined) insert(parent, record.child);
    else insert(parent, record.child, before);
  }

  private reconcileStickyRecords(): void {
    if (this.contentNode === undefined) return;
    dlog(
      `Angular ScrollView projection reconcile contentNode=${this.contentNode.component} records=${this.records.length} contentNodeActualChildren=${this.contentNode.children.length}`,
    );
    const stickyIndices = new Set(this.config.stickyHeaderIndices ?? []);
    if (this.config.customStickyHeaderComponent !== undefined && stickyIndices.size > 0) {
      dlog(
        'Angular ScrollView projection uses built-in sticky wrapper; custom StickyHeaderComponent is explicit-composition only',
      );
    }

    let paintIndex = 0;
    for (const record of [...this.records]) {
      if (this.config.excludeRefreshControl && isProjectedRefreshControl(record.child)) {
        this.removeProjectedChild(record.child, (parent, child) => removeChild(parent, child));
        continue;
      }
      const countsAsChild = !isAnchor(record.child) && !isProjectedRefreshControl(record.child);
      const childIndex = paintIndex;
      if (countsAsChild) paintIndex += 1;
      const shouldWrap = countsAsChild && stickyIndices.has(childIndex);
      if (shouldWrap && record.wrapper === undefined) this.wrapRecord(record, childIndex);
      else if (!shouldWrap && record.wrapper !== undefined) this.unwrapRecord(record);
      else if (shouldWrap && record.stickyIndex !== childIndex) {
        record.sticky?.destroy();
        record.sticky = new StickyProjectionWrapper(this, childIndex, directNode(record));
        record.stickyIndex = childIndex;
      } else if (shouldWrap) record.sticky?.rebuild();
    }
  }

  // Auto projection runs after Angular has already created projected child host nodes. At this
  // renderer boundary we can AOT-safely rearrange engine nodes, but we cannot instantiate an
  // arbitrary Angular component class as a wrapper without owning a ViewContainerRef/injector and
  // Angular projectable nodes for its <ng-content>. Therefore the automatic sticky path always uses
  // the built-in engine-node wrapper; custom StickyHeaderComponent wrappers remain supported by
  // explicit Angular composition with <ScrollViewStickyHeader>/<symbiote-sticky-header> or a user
  // component that composes it in the template.
  private wrapRecord(record: IProjectedRecord, childIndex: number): void {
    if (this.contentNode === undefined) return;
    const wrapper = createViewNode();
    const currentParent = record.child.parent;
    const currentIndex = currentParent?.children.indexOf(record.child) ?? -1;
    if (currentParent === this.contentNode && currentIndex >= 0) {
      insertBefore(this.contentNode, wrapper, record.child);
      removeChild(this.contentNode, record.child);
    } else {
      appendChild(this.contentNode, wrapper);
    }
    appendChild(wrapper, record.child);
    record.wrapper = wrapper;
    record.sticky = new StickyProjectionWrapper(this, childIndex, wrapper);
    record.stickyIndex = childIndex;
    projectedWrappers.set(record.child, record);
  }

  private unwrapRecord(record: IProjectedRecord): void {
    if (this.contentNode === undefined || record.wrapper === undefined) return;
    record.sticky?.destroy();
    record.sticky = undefined;
    record.stickyIndex = undefined;
    const wrapper = record.wrapper;
    insertBefore(this.contentNode, record.child, wrapper);
    removeChild(this.contentNode, wrapper);
    record.wrapper = undefined;
    projectedWrappers.delete(record.child);
  }
}

export function getScrollViewProjection(
  node: ISymbioteNode,
): ScrollViewProjectionController | undefined {
  return contentProjection.get(node);
}

export function removeScrollViewProjectedChild(child: ISymbioteNode, remove: IRemove): boolean {
  const record = projectedWrappers.get(child);
  if (record === undefined) return false;
  const controller = record.wrapper?.parent
    ? contentProjection.get(record.wrapper.parent)
    : undefined;
  return controller?.removeProjectedChild(child, remove) ?? false;
}
