---
name: symbiote-parity-check
description: "Symbiote parity-check workflow — verify a component reaches FULL feature-parity across adapters, the P0 'proven by a parity check' gate. Run it as the LAST phase of symbiote-add-component, or standalone to audit an existing component for drift. React is the REFERENCE surface (M1/M2 done, widest prop-edge coverage). Method: (1) enumerate X's complete surface on React — every prop, event, imperative method, and platform (.ios/.android) branch. (2) prop-by-prop DIFF against X on Vue (and each future adapter); any prop/event/method present on React but missing on the other is a P0 gap, NOT a follow-up. (3) confirm parity is STRUCTURAL — the shared half (reducer + renderX + prop resolution) lives in @symbiote-native/components and both adapters call it, rather than each re-implementing the surface (a hand-copied surface that happens to match today will drift). (4) confirm the agnostic public prop type (ISwitchProps etc.) is RE-EXPORTED from @symbiote-native/components by every adapter, never redeclared. (5) smoke both adapters headless (vitest, ADR 0025) + the co-located component tests. Trigger on parity verification, component audit, 'is X at parity across adapters', or finishing an add-component task."
---

# Symbiote parity-check — proving full feature-parity

P0 (`<adapters_reach_full_feature_parity>`): every component ships at full
feature-parity across ALL adapters, and "add component X to adapter Y" is DONE
only when X on Y matches X everywhere else — **proven by a parity check**, not
asserted. This skill is that check. It is the final phase of
`symbiote-add-component` and a standalone drift audit.

## 1. React is the reference surface

React is the validated, widest adapter (M1/M2 done, the reference prop-edge
coverage). Parity is always measured **against React**: a prop/event/method that
React's X exposes and another adapter's X does not is a gap to close, not a
difference to accept.

## 2. The diff — enumerate, then compare

```
STEP 1  Enumerate X's full surface on React:
        - every PROP            (incl. platform-only ones)
        - every EVENT           (onChange, onValueChange, responder events…)
        - every IMPERATIVE METHOD on the ref (focus/blur/measure/setNativeProps/scrollTo…)
        - every PLATFORM BRANCH (.ios.ts vs .android.ts — command names, prop names, defaults)

STEP 2  For Vue (and each other adapter), confirm each item is present and behaves the same.
        Missing on the other adapter → P0 GAP (close it now, do not defer).

STEP 3  Reductions are violations: a 'minimal' / 'basic' / 'partial' / 'stub' port is FORBIDDEN.
```

Concretely for Switch: `value`, `onValueChange`, `onChange`, `disabled`,
`trackColor`, `thumbColor`, `ios_backgroundColor`, `style`, the accessibility/aria
fields, the snap-back command, AND the iOS/Android prop-name + command split — all
present on both adapters.

## 3. Structural, not hand-copied

Matching surfaces today is necessary but not sufficient — two hand-copied
implementations drift. Parity must be **structural**:

```
✓ the shared half (reducer + renderX + prop resolution) lives ONCE in @symbiote-native/components
✓ each adapter calls it and supplies ONLY lifecycle + the descriptor bridge
✗ an adapter re-implements state or render for a component that already exists in core/components
  → this is the exact bug the three-layer split exists to prevent (<components_split_logic_view_lifecycle>)
```

So the check includes: does X's logic/view actually come from
`core/components/src/{state,view}/`, or did the adapter grow its own copy?

## 4. Prop-type re-export check

The agnostic public prop type is defined ONCE and re-exported, never redeclared:

```
✓ adapters/react/src/components/switch/shared.ts:  export type { ISwitchProps } from '@symbiote-native/components'
✗ a second `interface ISwitchProps { … }` inside an adapter  → duplication bug
```

A per-adapter type (children/ref-bearing: `IViewProps`, `IPressableProps`) is
expected to be separately declared — that's by design, not a gap
(`symbiote-file-layout` §4).

## 5. Smoke

```
pnpm test                        vitest headless — the co-located X tests on both adapters (ADR 0025)
  state/X.test.ts                reducer + predicates (framework-free)
  view/render-X.test.ts          Descriptor snapshot
  components/X/X.test.*          per-adapter lifecycle (React + Vue + Angular)
detox (device/sim)               anything needing a real Fabric tag — native commands, autoFocus,
                                 sticky headers (the headless smoke CANNOT prove these; see
                                 vue-adapter-reactivity §2 — a missing tag is green headless, dead on device)
```

A native-driven feature green in vitest but untested on a simulator is NOT proven
at parity — the async-commit-timing class is invisible headless.

Run the detox/simulator leg against `.examples/<app>` (workspace:*-linked), never
`examples/<app>` (published-catalog canary) — `symbiote-dev-examples`.

## 6. Verdict

```
PARITY        every React prop/event/method/platform-branch present + structural + re-exported + smoke green
PARTIAL       enumerate the EXACT missing items → they are the remaining work (P0, not a follow-up)
DRIFT         surfaces match but logic/view is hand-copied in an adapter → extract to core/components
```

## Reference

- The P0 invariant: `<adapters_reach_full_feature_parity>`. The split it relies on:
  `<components_split_logic_view_lifecycle>`.
- Reference component surface: `adapters/react/src/components/switch/*` vs
  `adapters/vue/src/components/switch/*`; shared half in
  `core/components/src/{state,view}/switch*`.
- Building the component this check gates: `symbiote-add-component`.
- Native-only parity (tag-dependent features): `vue-adapter-reactivity` §2.
- Testing strategy: `.docs/decisions/0025` (vitest + detox).
</content>
