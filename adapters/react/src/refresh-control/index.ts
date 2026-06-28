// RefreshControl primitive. On iOS this is the PullToRefreshView Fabric node that
// lives INSIDE a ScrollView (a sibling of the content container), giving the
// pull-to-refresh gesture. `refreshing` is a controlled prop: the parent owns it
// and pushes it down each commit; native reports the gesture via the direct
// `topRefresh` event, which shared routes to the `refresh` listener (onRefresh).

import { createElement, type FC, type ReactNode } from 'react';
import { dlog } from '@symbiote/engine';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote/components';

export interface IRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // RN's onRefresh is `() => void | Promise<void>`, the handler may be async; the
  // promise is fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RN RefreshControlPropsAndroid, RefreshControl.js:44-55):
  // `colors` are the indicator's animated stroke colors (at least one),
  // `progressBackgroundColor` the disc behind it, `size` the diameter preset. The Android
  // AndroidSwipeRefreshLayout manager reads them directly; PullToRefreshView on iOS ignores
  // unknown props, so forwarding them through `...nativeProps` is harmless on iOS.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop. RN's Android branch (RefreshControl.js:174) strips only
  // {tintColor,titleColor,title} and forwards `enabled` to AndroidSwipeRefreshLayout, so
  // it must ride down via `...nativeProps`. RN's iOS branch (RefreshControl.js:165)
  // destructures `enabled` OUT before spreading to PullToRefreshView, so iOS native never
  // reads it; forwarding it is harmless there, like the other Android-only props above.
  enabled?: boolean;
  // On Android the RefreshControl WRAPS the ScrollView (ADR 0020), so it receives the
  // scroll view as its child via cloneElement. On iOS it is a childless sibling, so this
  // is undefined there; passing it through is harmless.
  children?: ReactNode;
}

export const RefreshControl: FC<IRefreshControlProps> = rawProps => {
  // Owns its host element (symbiote-refresh-control), so it folds aria/role here;
  // the resolved accessibility* fields ride down via `...nativeProps`.
  const props = resolveAccessibilityProps(rawProps);
  const { children, ...nativeProps } = props;
  dlog('RefreshControl -> PullToRefreshView');
  dlog(`RefreshControl refreshing=${String(props.refreshing)}`);
  if (props.enabled !== undefined)
    dlog(`RefreshControl enabled=${String(props.enabled)} (Android-only)`);
  if (props.onRefresh !== undefined) dlog('RefreshControl onRefresh listener wired');
  return createElement('symbiote-refresh-control', { ...nativeProps }, children);
};
