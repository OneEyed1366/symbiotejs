import { EventEmitter } from '@angular/core';
import {
  imageStatics,
  renderImage,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IImageProps,
  type IImageSourceProp,
  type IResizeMode,
} from '@symbiote-native/components';
import {
  isSymbioteEvent,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';

export { setImageSourceResolver } from '@symbiote-native/components';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/components';

export const IMAGE_INPUTS = [
  'source',
  'defaultSource',
  'loadingIndicatorSource',
  'style',
  'resizeMode',
  'resizeMethod',
  'tintColor',
  'blurRadius',
  'capInsets',
  'fadeDuration',
  'progressiveRenderingEnabled',
  'src',
  'srcSet',
  'alt',
  'width',
  'height',
  'crossOrigin',
  'referrerPolicy',
  'testID',
  'nativeID',
  'accessible',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityLabelledBy',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'screenReaderFocusable',
  'accessibilityViewIsModal',
  'accessibilityElementsHidden',
  'accessibilityIgnoresInvertColors',
  'accessibilityLanguage',
  'accessibilityRespondsToUserInteraction',
  'accessibilityShowsLargeContentViewer',
  'accessibilityLargeContentTitle',
  'role',
  'ariaLabel: aria-label',
  'ariaLabelledBy: aria-labelledby',
  'ariaLive: aria-live',
  'ariaHidden: aria-hidden',
  'ariaBusy: aria-busy',
  'ariaChecked: aria-checked',
  'ariaDisabled: aria-disabled',
  'ariaExpanded: aria-expanded',
  'ariaSelected: aria-selected',
  'ariaModal: aria-modal',
  'ariaValueMax: aria-valuemax',
  'ariaValueMin: aria-valuemin',
  'ariaValueNow: aria-valuenow',
  'ariaValueText: aria-valuetext',
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onMagicTap',
  'onAccessibilityEscape',
  'onLoadStart',
  'onLoad',
  'onLoadEnd',
  'onError',
  'onProgress',
  'onPartialLoad',
];

export const IMAGE_OUTPUTS = [
  'accessibilityAction',
  'accessibilityTap',
  'magicTap',
  'accessibilityEscape',
  'loadStart',
  'load',
  'loadEnd',
  'error',
  'progress',
  'partialLoad',
];

type IImagePassthroughProps = Record<string, unknown> &
  IAccessibilityProps &
  IAriaProps &
  Pick<
    IImageProps,
    | 'resizeMethod'
    | 'blurRadius'
    | 'capInsets'
    | 'fadeDuration'
    | 'progressiveRenderingEnabled'
    | 'onLoadStart'
    | 'onLoad'
    | 'onLoadEnd'
    | 'onError'
    | 'onProgress'
    | 'onPartialLoad'
  >;

function asSource(value: unknown): IImageSourceProp | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null) return value;
  return undefined;
}

function asResizeMode(value: unknown): IResizeMode | undefined {
  if (
    value === 'cover' ||
    value === 'contain' ||
    value === 'stretch' ||
    value === 'repeat' ||
    value === 'center'
  ) {
    return value;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asCrossOrigin(value: unknown): 'anonymous' | 'use-credentials' | undefined {
  return value === 'anonymous' || value === 'use-credentials' ? value : undefined;
}

function asStyle(value: unknown): IStyleProp<IViewStyle> | undefined {
  return typeof value === 'object' && value !== null ? value : undefined;
}

export function resolveImageProps(input: Record<string, unknown>): Record<string, unknown> {
  const passthrough: IImagePassthroughProps = {
    resizeMethod: input['resizeMethod'] as IImageProps['resizeMethod'],
    blurRadius: asNumber(input['blurRadius']),
    capInsets: input['capInsets'] as IImageProps['capInsets'],
    fadeDuration: asNumber(input['fadeDuration']),
    progressiveRenderingEnabled:
      typeof input['progressiveRenderingEnabled'] === 'boolean'
        ? input['progressiveRenderingEnabled']
        : undefined,
    testID: asString(input['testID']),
    nativeID: asString(input['nativeID']),
    accessible: typeof input['accessible'] === 'boolean' ? input['accessible'] : undefined,
    accessibilityLabel: asString(input['accessibilityLabel']),
    accessibilityHint: asString(input['accessibilityHint']),
    accessibilityRole: input['accessibilityRole'] as IAccessibilityProps['accessibilityRole'],
    accessibilityState: input['accessibilityState'] as IAccessibilityProps['accessibilityState'],
    accessibilityValue: input['accessibilityValue'] as IAccessibilityProps['accessibilityValue'],
    accessibilityActions: input[
      'accessibilityActions'
    ] as IAccessibilityProps['accessibilityActions'],
    accessibilityLabelledBy: input[
      'accessibilityLabelledBy'
    ] as IAccessibilityProps['accessibilityLabelledBy'],
    importantForAccessibility: input[
      'importantForAccessibility'
    ] as IAccessibilityProps['importantForAccessibility'],
    accessibilityLiveRegion: input[
      'accessibilityLiveRegion'
    ] as IAccessibilityProps['accessibilityLiveRegion'],
    screenReaderFocusable:
      typeof input['screenReaderFocusable'] === 'boolean'
        ? input['screenReaderFocusable']
        : undefined,
    accessibilityViewIsModal:
      typeof input['accessibilityViewIsModal'] === 'boolean'
        ? input['accessibilityViewIsModal']
        : undefined,
    accessibilityElementsHidden:
      typeof input['accessibilityElementsHidden'] === 'boolean'
        ? input['accessibilityElementsHidden']
        : undefined,
    accessibilityIgnoresInvertColors:
      typeof input['accessibilityIgnoresInvertColors'] === 'boolean'
        ? input['accessibilityIgnoresInvertColors']
        : undefined,
    accessibilityLanguage: asString(input['accessibilityLanguage']),
    accessibilityRespondsToUserInteraction:
      typeof input['accessibilityRespondsToUserInteraction'] === 'boolean'
        ? input['accessibilityRespondsToUserInteraction']
        : undefined,
    accessibilityShowsLargeContentViewer:
      typeof input['accessibilityShowsLargeContentViewer'] === 'boolean'
        ? input['accessibilityShowsLargeContentViewer']
        : undefined,
    accessibilityLargeContentTitle: asString(input['accessibilityLargeContentTitle']),
    role: input['role'] as IAriaProps['role'],
    'aria-label': asString(input['ariaLabel'] ?? input['aria-label']),
    'aria-labelledby': asString(input['ariaLabelledBy'] ?? input['aria-labelledby']),
    'aria-live': input['ariaLive'] as IAriaProps['aria-live'],
    'aria-hidden': typeof input['ariaHidden'] === 'boolean' ? input['ariaHidden'] : undefined,
    'aria-busy': typeof input['ariaBusy'] === 'boolean' ? input['ariaBusy'] : undefined,
    'aria-checked': input['ariaChecked'] as IAriaProps['aria-checked'],
    'aria-disabled': typeof input['ariaDisabled'] === 'boolean' ? input['ariaDisabled'] : undefined,
    'aria-expanded': typeof input['ariaExpanded'] === 'boolean' ? input['ariaExpanded'] : undefined,
    'aria-selected': typeof input['ariaSelected'] === 'boolean' ? input['ariaSelected'] : undefined,
    'aria-modal': typeof input['ariaModal'] === 'boolean' ? input['ariaModal'] : undefined,
    'aria-valuemax': asNumber(input['ariaValueMax']),
    'aria-valuemin': asNumber(input['ariaValueMin']),
    'aria-valuenow': asNumber(input['ariaValueNow']),
    'aria-valuetext': asString(input['ariaValueText']),
    onAccessibilityAction: input['onAccessibilityAction'] as IImageProps['onLoad'],
    onAccessibilityTap: input['onAccessibilityTap'] as IImageProps['onLoad'],
    onMagicTap: input['onMagicTap'] as IImageProps['onLoad'],
    onAccessibilityEscape: input['onAccessibilityEscape'] as IImageProps['onLoad'],
    onLoadStart: input['onLoadStart'] as IImageProps['onLoadStart'],
    onLoad: input['onLoad'] as IImageProps['onLoad'],
    onLoadEnd: input['onLoadEnd'] as IImageProps['onLoadEnd'],
    onError: input['onError'] as IImageProps['onError'],
    onProgress: input['onProgress'] as IImageProps['onProgress'],
    onPartialLoad: input['onPartialLoad'] as IImageProps['onPartialLoad'],
  };

  return renderImage({
    source: asSource(input['source']),
    defaultSource: asSource(input['defaultSource']),
    loadingIndicatorSource: asSource(input['loadingIndicatorSource']),
    style: asStyle(input['style']),
    resizeMode: asResizeMode(input['resizeMode']),
    tintColor: asString(input['tintColor']),
    src: asString(input['src']),
    srcSet: asString(input['srcSet']),
    alt: asString(input['alt']),
    width: asNumber(input['width']),
    height: asNumber(input['height']),
    crossOrigin: asCrossOrigin(input['crossOrigin']),
    referrerPolicy: asString(input['referrerPolicy']),
    passthrough: resolveAccessibilityProps(passthrough),
  }).props;
}

export abstract class ImageBase {
  static readonly getSize = imageStatics.getSize;
  static readonly getSizeWithHeaders = imageStatics.getSizeWithHeaders;
  static readonly prefetch = imageStatics.prefetch;
  static readonly abortPrefetch = imageStatics.abortPrefetch;
  static readonly queryCache = imageStatics.queryCache;
  static readonly resolveAssetSource = imageStatics.resolveAssetSource;

  source: unknown;
  defaultSource: unknown;
  loadingIndicatorSource: unknown;
  style: unknown;
  resizeMode: unknown;
  resizeMethod: IImageProps['resizeMethod'];
  tintColor: unknown;
  blurRadius: number | undefined;
  capInsets: IImageProps['capInsets'];
  fadeDuration: number | undefined;
  progressiveRenderingEnabled: boolean | undefined;
  src: unknown;
  srcSet: unknown;
  alt: unknown;
  width: unknown;
  height: unknown;
  crossOrigin: unknown;
  referrerPolicy: unknown;

  testID: string | undefined;
  nativeID: string | undefined;
  accessible: boolean | undefined;
  accessibilityLabel: string | undefined;
  accessibilityHint: string | undefined;
  accessibilityRole: IAccessibilityProps['accessibilityRole'];
  accessibilityState: IAccessibilityProps['accessibilityState'];
  accessibilityValue: IAccessibilityProps['accessibilityValue'];
  accessibilityActions: IAccessibilityProps['accessibilityActions'];
  accessibilityLabelledBy: IAccessibilityProps['accessibilityLabelledBy'];
  importantForAccessibility: IAccessibilityProps['importantForAccessibility'];
  accessibilityLiveRegion: IAccessibilityProps['accessibilityLiveRegion'];
  screenReaderFocusable: boolean | undefined;
  accessibilityViewIsModal: boolean | undefined;
  accessibilityElementsHidden: boolean | undefined;
  accessibilityIgnoresInvertColors: boolean | undefined;
  accessibilityLanguage: string | undefined;
  accessibilityRespondsToUserInteraction: boolean | undefined;
  accessibilityShowsLargeContentViewer: boolean | undefined;
  accessibilityLargeContentTitle: string | undefined;

  role: IAriaProps['role'];
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  ariaLive: IAriaProps['aria-live'];
  ariaHidden: boolean | undefined;
  ariaBusy: boolean | undefined;
  ariaChecked: IAriaProps['aria-checked'];
  ariaDisabled: boolean | undefined;
  ariaExpanded: boolean | undefined;
  ariaSelected: boolean | undefined;
  ariaModal: boolean | undefined;
  ariaValueMax: number | undefined;
  ariaValueMin: number | undefined;
  ariaValueNow: number | undefined;
  ariaValueText: string | undefined;

  onAccessibilityAction: ((event: ISymbioteEvent) => void) | undefined;
  onAccessibilityTap: ((event: ISymbioteEvent) => void) | undefined;
  onMagicTap: ((event: ISymbioteEvent) => void) | undefined;
  onAccessibilityEscape: ((event: ISymbioteEvent) => void) | undefined;
  onLoadStart: ((event: ISymbioteEvent) => void) | undefined;
  onLoad: ((event: ISymbioteEvent) => void) | undefined;
  onLoadEnd: ((event: ISymbioteEvent) => void) | undefined;
  onError: ((event: ISymbioteEvent) => void) | undefined;
  onProgress: ((event: ISymbioteEvent) => void) | undefined;
  onPartialLoad: ((event: ISymbioteEvent) => void) | undefined;

  readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  readonly magicTap = new EventEmitter<ISymbioteEvent>();
  readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  readonly loadStart = new EventEmitter<ISymbioteEvent>();
  readonly load = new EventEmitter<ISymbioteEvent>();
  readonly loadEnd = new EventEmitter<ISymbioteEvent>();
  readonly error = new EventEmitter<ISymbioteEvent>();
  readonly progress = new EventEmitter<ISymbioteEvent>();
  readonly partialLoad = new EventEmitter<ISymbioteEvent>();

  handleAccessibilityAction(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onAccessibilityAction?.(event);
    this.accessibilityAction.emit(event);
  }

  handleAccessibilityTap(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onAccessibilityTap?.(event);
    this.accessibilityTap.emit(event);
  }

  handleMagicTap(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onMagicTap?.(event);
    this.magicTap.emit(event);
  }

  handleAccessibilityEscape(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onAccessibilityEscape?.(event);
    this.accessibilityEscape.emit(event);
  }

  handleLoadStart(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onLoadStart?.(event);
    this.loadStart.emit(event);
  }

  handleLoad(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onLoad?.(event);
    this.load.emit(event);
  }

  handleLoadEnd(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onLoadEnd?.(event);
    this.loadEnd.emit(event);
  }

  handleError(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onError?.(event);
    this.error.emit(event);
  }

  handleProgress(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onProgress?.(event);
    this.progress.emit(event);
  }

  handlePartialLoad(event: Event): void {
    if (!isSymbioteEvent(event)) return;
    this.onPartialLoad?.(event);
    this.partialLoad.emit(event);
  }

  protected get imageInputProps(): Record<string, unknown> {
    return {
      source: this.source,
      defaultSource: this.defaultSource,
      loadingIndicatorSource: this.loadingIndicatorSource,
      style: this.style,
      resizeMode: this.resizeMode,
      resizeMethod: this.resizeMethod,
      tintColor: this.tintColor,
      blurRadius: this.blurRadius,
      capInsets: this.capInsets,
      fadeDuration: this.fadeDuration,
      progressiveRenderingEnabled: this.progressiveRenderingEnabled,
      src: this.src,
      srcSet: this.srcSet,
      alt: this.alt,
      width: this.width,
      height: this.height,
      crossOrigin: this.crossOrigin,
      referrerPolicy: this.referrerPolicy,
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction: this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer: this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      ariaLabel: this.ariaLabel,
      ariaLabelledBy: this.ariaLabelledBy,
      ariaLive: this.ariaLive,
      ariaHidden: this.ariaHidden,
      ariaBusy: this.ariaBusy,
      ariaChecked: this.ariaChecked,
      ariaDisabled: this.ariaDisabled,
      ariaExpanded: this.ariaExpanded,
      ariaSelected: this.ariaSelected,
      ariaModal: this.ariaModal,
      ariaValueMax: this.ariaValueMax,
      ariaValueMin: this.ariaValueMin,
      ariaValueNow: this.ariaValueNow,
      ariaValueText: this.ariaValueText,
      onAccessibilityAction: this.onAccessibilityAction,
      onAccessibilityTap: this.onAccessibilityTap,
      onMagicTap: this.onMagicTap,
      onAccessibilityEscape: this.onAccessibilityEscape,
      onLoadStart: this.onLoadStart,
      onLoad: this.onLoad,
      onLoadEnd: this.onLoadEnd,
      onError: this.onError,
      onProgress: this.onProgress,
      onPartialLoad: this.onPartialLoad,
    };
  }

  get imageProps(): Record<string, unknown> {
    return resolveImageProps(this.imageInputProps);
  }
}
