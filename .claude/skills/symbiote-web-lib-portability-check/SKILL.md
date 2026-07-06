---
name: symbiote-web-lib-portability-check
description: "Symbiote web-library portability check — read BEFORE adding any npm library marketed as 'pure', 'framework-agnostic', or 'isomorphic' (react-router's matchPath/matchRoutes, vue-router's memory history, any 'works everywhere' utility) as a dependency of core/, adapters/*, or packages/*. Apparent purity from docs/memory is not sufficient evidence in this DOM-free Metro/Hermes monorepo. Covers the concrete case that motivated this: react-router's matchPath/matchRoutes/generatePath were evaluated for packages/navigation's deep-linking layer and REJECTED after actually installing and inspecting the package — its only general `.` export eagerly imports `./lib/dom/*` and `./lib/server-runtime/*` (no pure-matcher subpath exists), its peerDependencies pin react-dom (conflicts with `<react_native_is_an_explicit_top_level_peer>`), and its param-name typing relies on compile-time literal-string inference that degrades to plain `string` for our runtime-computed patterns — forcing an `as` cast, which ts-js-best-practices forbids. Trigger on: evaluating a web library for reuse, 'is X DOM-free', 'can we use react-router/vue-router/X here', dependency-portability question, any candidate 'framework-agnostic' npm package for core/engine or a navigation/routing/history feature."
---

# Web-library portability check (Symbiote)

A library documented as "pure" or "framework-agnostic" is evaluated against the
*web* ecosystem's definition of agnostic (no DOM assumption), not against this
monorepo's actual constraints: Metro/Hermes bundling (no `react-dom`, no
browser globals), and the no-`as`-cast rule (`ts-js-best-practices`). Docs and
training-data familiarity are not evidence here — install the package and read
its real exports/types.

## The case that motivated this

`packages/navigation`'s deep-linking layer needed path-pattern matching
(`/user/:id` → `{id}`). `react-router`'s `matchPath`/`matchRoutes`/`generatePath`
looked like a perfect, battle-tested, DOM-free fit — the docs even say
`createMemoryRouter` is "for non-browser environments without a DOM API."

Installing `react-router@8.1.0` and actually reading it disqualified it:

1. **No pure-matcher subpath exists.** The package's only general `.` export
   eagerly imports `./lib/dom/*` (`BrowserRouter`, `ScrollRestoration`,
   cookies) and `./lib/server-runtime/*` — DOM/Node code with no business in a
   Hermes/Metro bundle. `matchPath` is not separately exported without that.
2. **`peerDependencies` pin `react-dom`.** This DOM-free monorepo never
   installs it — exactly the foreign-runtime-dependency problem
   `<react_native_is_an_explicit_top_level_peer>` (CLAUDE.md) warns against for
   `react-native` itself.
3. **The param-name typing needs a compile-time literal.** `matchPath<Path
   extends string>` extracts `:id` via a template-literal-type trick that only
   fires when `Path` is a literal string at the call site. Symbiote's route
   patterns come from a runtime config object, so `Path` widens to plain
   `string` and the extracted param type collapses — using the result forces
   an `as` cast, which `ts-js-best-practices` forbids outright.

Resolution: hand-rolled a ~40-line `:param`-segment matcher in
`packages/navigation/src/core/linking-config.ts` instead. Small, exactly fits
the flat (non-nested) route model, zero dependency risk.

## The check

Before adding a "pure"/"agnostic" web library as a dependency, actually
install it (`pnpm add -D <lib>` in a scratch dir, or `node_modules` peek if
already hoisted) and answer three questions from the real package, not docs:

1. **Entry point.** Does the export you need come from an entry that also
   pulls in DOM (`document`, `window`), Node (`fs`, `http`), or a server
   runtime? Check `package.json`'s `exports` map for a genuinely separate
   subpath — if the only way to reach the "pure" function is through an entry
   that imports DOM code, Metro still bundles that code (dead-code elimination
   is not guaranteed for side-effectful module-level imports).
2. **peerDependencies.** Does it peer on `react-dom`, a browser API, or
   anything this monorepo doesn't already carry as a top-level pin? A peer
   dependency this workspace can't satisfy is a hard no, not a "we'll ignore
   the warning."
3. **Type inference under runtime input.** If the library's ergonomics lean on
   TypeScript literal-type tricks (template literal types, `const` type
   params), check whether your actual call site passes a literal or a
   runtime-computed value. A runtime value silently widens the generic — the
   result typechecks by accident (as `unknown`/`string`) and using it
   correctly needs an `as`, which is forbidden here. This failure mode is
   invisible until you write the real call site with real (non-literal) data.

If any of the three fails, don't force the dependency — hand-roll the small
piece you actually need (as `linking-config.ts` did) rather than accept a
foreign-runtime dependency or a forbidden cast to make a "framework-agnostic"
label true in practice.

## Verify

Any time this check blocks a candidate dependency: confirm the rejection with
a real install + read, not a docs skim — `node_modules/<lib>/package.json`'s
`exports`/`peerDependencies`, and the `.d.ts` for the specific function's
generic signature.
