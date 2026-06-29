// Co-located unit test (ADR 0025): RN's babel preset in dev runs transform-react-jsx-self /
// -source, annotating every JSX element with __self (the component instance) and __source
// ({ fileName, lineNumber, columnNumber }). A JSX-based adapter carries them onto the vnode as
// ordinary props; routeProp must drop them so they never reach Fabric. __self carries a
// function, which crashed Android's folly::dynamic ("JS Functions are not convertible to
// dynamic").

import { describe, expect, it } from 'vitest';
import { createElement, routeProp } from '../index';

describe('routeProp strips dev-only JSX annotations', () => {
  it('drops __source and __self while keeping real props and event listeners', () => {
    const node = createElement('RCTView');

    // The exact shape the dev react-jsx-self / -source plugins inject.
    routeProp(node, '__source', { fileName: 'App.tsx', lineNumber: 66, columnNumber: 7 });
    routeProp(node, '__self', { someInstanceMethod: () => undefined });

    expect('__source' in node.props).toBe(false);
    expect('__self' in node.props).toBe(false);

    const onRelease = (): void => {};
    routeProp(node, 'style', { flex: 1 });
    routeProp(node, 'onResponderRelease', onRelease);

    expect(node.props.style).toBeDefined();
    // A responder handler becomes a listener, not a prop.
    expect('onResponderRelease' in node.props).toBe(false);
    expect(node.listeners?.has('responderRelease')).toBe(true);
  });
});
