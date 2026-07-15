// Modal: the Vue lifecycle half. RCTModalHostView is an ordinary Fabric host node committing
// through the same childSet as the rest of the tree (no second JS surface). The style math (the
// backdrop override, the container/host styles, the presentationStyle default), the visible gate,
// and the iOS keep-alive reducer all live framework-agnostic in @symbiote-native/components and are shared
// verbatim with React; here Vue supplies only the lifecycle: a ref over the keep-alive state +
// a POST-flush watch that drives the visible→hidden transition AFTER render (so one keep-alive
// frame survives, the Vue twin of React's useEffect-after-render), and the Descriptor bridge,
// nesting the slot children UNDER the container View.
//
// Inputs arrive as attrs (untyped), each narrowed with a runtime guard rather than a cast. The
// events (onShow/onDismiss/onRequestClose/onOrientationChange) are real ViewConfig DirectEvents,
// so, unlike Switch's pure-JS onValueChange, they forward to the host raw via passthrough.

import { defineComponent, h, ref, watch } from '@vue/runtime-core';
import {
  createInitialModalState,
  modalReducer,
  renderModal,
  resolveAccessibilityProps,
  shouldRenderModal,
  type IAccessibilityProps,
  type IAriaProps,
  type IModalAnimationType,
  type IModalOrientation,
  type IModalOrientationChangeEvent,
  type IModalPresentationStyle,
  type IModalState,
} from '@symbiote-native/components';
import {
  dlog,
  type IClassNameValue,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';

import { normalizeVueAttrs } from '../../utils/normalize-attrs';

export type {
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from '@symbiote-native/components';

// The Vue-facing prop surface (React's carries `children?: ReactNode`; Vue takes children via slots).
export interface IModalProps extends IAccessibilityProps, IAriaProps {
  visible?: boolean;
  transparent?: boolean;
  backdropColor?: string;
  animationType?: IModalAnimationType;
  presentationStyle?: IModalPresentationStyle;
  supportedOrientations?: ReadonlyArray<IModalOrientation>;
  hardwareAccelerated?: boolean;
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
  allowSwipeDismissal?: boolean;
  style?: IStyleProp<IViewStyle>;
  // Like `style`, targets the CONTAINER View renderModal wraps the children in, not the outer
  // symbiote-modal host — IS in HANDLED_ATTRS below (unlike a plain passthrough prop) so it is
  // applied explicitly on the container in the final h() call, matching where style lands.
  class?: IClassNameValue;
}

export type IModalEmits = {
  show: () => boolean;
  dismiss: () => boolean;
  requestClose: () => boolean;
  orientationChange: (event: IModalOrientationChangeEvent) => boolean;
};

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asAnimationType(value: unknown): IModalAnimationType | undefined {
  return value === 'none' || value === 'slide' || value === 'fade' ? value : undefined;
}

function asPresentationStyle(value: unknown): IModalPresentationStyle | undefined {
  return value === 'fullScreen' ||
    value === 'pageSheet' ||
    value === 'formSheet' ||
    value === 'overFullScreen'
    ? value
    : undefined;
}

const ORIENTATIONS: ReadonlyArray<IModalOrientation> = [
  'portrait',
  'portrait-upside-down',
  'landscape',
  'landscape-left',
  'landscape-right',
];

function isOrientation(value: unknown): value is IModalOrientation {
  // .includes() types its arg as IModalOrientation, so a bare string won't pass; .some keeps the
  // ORIENTATIONS list as the single source of truth without an `as` cast.
  return typeof value === 'string' && ORIENTATIONS.some(orientation => orientation === value);
}

function asSupportedOrientations(value: unknown): ReadonlyArray<IModalOrientation> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every(isOrientation) ? value : undefined;
}

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

// The typed fields the render consumes and re-emits onto the host; everything else
// (accessibility, testID, raw native passthrough) forwards via passthrough.
const HANDLED_ATTRS = [
  'visible',
  'transparent',
  'backdropColor',
  'animationType',
  'presentationStyle',
  'supportedOrientations',
  'hardwareAccelerated',
  'statusBarTranslucent',
  'navigationBarTranslucent',
  'allowSwipeDismissal',
  'style',
  'class',
];

type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export const Modal = defineComponent<IModalProps, IModalEmits>(
  (_props, { attrs: rawAttrs, slots, emit }) => {
    const state = ref<IModalState>(createInitialModalState(rawAttrs.visible === true));

    // POST-flush so the transition fires AFTER the render that used the OLD state: on visible→hidden
    // the node renders once more (state.isRendered still true → the keep-alive frame), then this
    // drops it and the next render unmounts. flush:'pre' would unmount immediately, killing the
    // keep-alive. The reducer is identity-stable, so a no-op transition triggers no extra render.
    watch(
      () => rawAttrs.visible === true,
      isVisible => {
        state.value = modalReducer(state.value, isVisible ? { type: 'show' } : { type: 'hide' });
      },
      { flush: 'post' },
    );

    return () => {
      const isVisible = rawAttrs.visible === true;
      if (!shouldRenderModal(isVisible, state.value)) {
        dlog('Modal hidden -> no node committed');
        return null;
      }

      const attrs = normalizeVueAttrs(rawAttrs);
      const root = renderModal({
        visible: asBoolean(attrs.visible),
        transparent: asBoolean(attrs.transparent),
        backdropColor: asString(attrs.backdropColor),
        animationType: asAnimationType(attrs.animationType),
        presentationStyle: asPresentationStyle(attrs.presentationStyle),
        supportedOrientations: asSupportedOrientations(attrs.supportedOrientations),
        hardwareAccelerated: asBoolean(attrs.hardwareAccelerated),
        statusBarTranslucent: asBoolean(attrs.statusBarTranslucent),
        navigationBarTranslucent: asBoolean(attrs.navigationBarTranslucent),
        allowSwipeDismissal: asBoolean(attrs.allowSwipeDismissal),
        style: isStyleProp(attrs.style) ? attrs.style : undefined,
        passthrough: resolveAccessibilityProps(forwardAttrs(attrs)),
      });

      // root = symbiote-modal > [container]; the slot children nest UNDER the container View, never
      // as a direct sibling of the host (RN's modal content layout).
      const [container] = root.children;
      if (typeof container === 'string') return null;
      const slotChildren = slots.default !== undefined ? slots.default() : [];
      return h(
        root.type,
        {
          ...root.props,
          key: root.key,
          onShow: (): void => emit('show'),
          onDismiss: (): void => emit('dismiss'),
          onRequestClose: (): void => emit('requestClose'),
          onOrientationChange: (event: IModalOrientationChangeEvent): void =>
            emit('orientationChange', event),
        },
        [
          h(
            container.type,
            { ...container.props, key: container.key, class: attrs.class },
            slotChildren,
          ),
        ],
      );
    };
  },
  {
    name: 'Modal',
    inheritAttrs: false,
    emits: {
      show: (): boolean => true,
      dismiss: (): boolean => true,
      requestClose: (): boolean => true,
      orientationChange: (_event: IModalOrientationChangeEvent): boolean => true,
    },
  },
);
