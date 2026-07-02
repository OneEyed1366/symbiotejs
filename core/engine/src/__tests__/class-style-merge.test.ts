// routeProp's centralized class+style merge (core/engine/src/node.ts): every adapter's
// `class`/`className`/`style` prop funnels through here, so a class registered by the SFC/CSS
// style compiler resolves identically for React (className), Vue (class), and Angular
// (addClass/removeClass, which joins its own token set into one string before calling
// routeProp — see adapters/angular/src/renderer.ts). Explicit `style` must always win over a
// class-derived one, regardless of which prop is set first or last.

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  createElement,
  flattenStyle,
  getExplicitStyle,
  registerStyles,
  routeProp,
} from '../index';

afterEach(() => clearGlobalStyles());

describe('routeProp class/className + style merge', () => {
  it('resolves a class name against the shared style registry', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'class', 'card');

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10 });
  });

  it('resolves className identically to class (React idiom, same registry)', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'className', 'card');

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10 });
  });

  it('lets an explicit style win over class-derived style, class set first', () => {
    registerStyles({ card: { padding: 10, backgroundColor: 'red' } });
    const node = createElement('RCTView');

    routeProp(node, 'class', 'card');
    routeProp(node, 'style', { backgroundColor: 'blue' });

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10, backgroundColor: 'blue' });
  });

  it('lets an explicit style win over class-derived style, style set first', () => {
    registerStyles({ card: { padding: 10, backgroundColor: 'red' } });
    const node = createElement('RCTView');

    routeProp(node, 'style', { backgroundColor: 'blue' });
    routeProp(node, 'class', 'card');

    expect(flattenStyle(node.props.style)).toEqual({ padding: 10, backgroundColor: 'blue' });
  });

  it('recomputes the merge when the class is later removed', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'class', 'card');
    routeProp(node, 'style', { backgroundColor: 'blue' });
    routeProp(node, 'class', undefined);

    expect(flattenStyle(node.props.style)).toEqual({ backgroundColor: 'blue' });
  });

  it('exposes the explicit style half via getExplicitStyle, unaffected by class', () => {
    registerStyles({ card: { padding: 10 } });
    const node = createElement('RCTView');

    routeProp(node, 'style', { backgroundColor: 'blue' });
    routeProp(node, 'class', 'card');

    expect(getExplicitStyle(node)).toEqual({ backgroundColor: 'blue' });
  });
});
