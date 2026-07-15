---
name: symbiote-navigation-web-facade-roadmap
description: "Symbiote navigation web-router-facade — DEFERRED ROADMAP decision (2026-07, beta). Read BEFORE building or re-proposing a web-router-style navigation API in packages/navigation (useRouter/useNavigate/Link/useParams/useLocalSearchParams/RouterLink/RouterView/router-outlet/routerLink/loaders), or when asked to make navigation feel like react-router / vue-router / expo-router / @angular/router, or to 'transfer web navigation knowledge to native'. Current package intentionally mirrors React Navigation (Stack.Screen name, useNavigation().navigate('Name'), useRoute/useFocusEffect/useIsFocused), NOT web routers. Holds: the DEFER rationale (beta bottleneck is shipping a minimal package set to build a real app, not evaluator-funnel DX); the SHAPE to build when resumed (lean verbs first — imperative router + Link + useParams/useRoute + linking-config route table; anchor to Expo Router shape; ONE shape lightly reskinned per framework not 3 clones; keep useNavigation as escape hatch and add useRouter; DEFER loaders/actions); the uncanny-valley risk + honest-docs mitigation; vendored reference locations (expo-router@55, react-router@8.2, vue-router, angular/router under .vendors); the ~19 portable vs ~40 not-portable Expo-test audit map with linking-config matcher gaps; and the 18-task build plan. This is a DECISION/roadmap record, not an active how-to."
---

# Symbiote navigation — web-router facade (DEFERRED to roadmap)

**Status: DEFERRED (2026-07, beta).** Not being built. This skill exists so a future
session resumes the decision instead of re-deriving it (the analysis cost ~a full session:
vendoring 4 router libs, a 5-agent Expo test audit, a go/no-go stress test).

## The idea (and why it's shelved)

**Goal:** break React's monopoly on native via DX — "transfer your framework knowledge from
web." Make each navigation adapter feel like that framework's WEB router (react-router for
React, vue-router for Vue, `@angular/router` for Angular) instead of the current
**React-Navigation** shape the package ships today (`Stack.Screen name`,
`useNavigation().navigate('Name')`, `useRoute`/`useFocusEffect`/`useIsFocused`).

**Why deferred:** in beta the real bottleneck is *"you can't yet build a real (non-demo)
app"* — the priority is shipping the minimal package set. The facade optimizes the
**evaluator-conversion funnel** (5-minute-demo familiarity), which is ~empty in beta.
The monopoly-break is delivered by **the adapter existing at all** (Vue/Angular can already
drive native); the facade is DX polish on top, never a blocker.

**Revisit when** the bottleneck shifts from "nobody can build a real app" to "people try it
and bounce because navigation feels foreign."

## The strategic framing (keep this — it's the crux)

```
Evaluator (5-min demo)  → familiarity matters A LOT; lean verbs (Link, router.push, useParams) win the demo. Loaders irrelevant.
Adopter (production bet) → familiarity matters LITTLE; stability/support/parity/ecosystem decide. Facade is noise, even a liability.
```

Facade value concentrates entirely in **Evaluator + lean verbs**. That's what dictates the
shape below.

## The shape to build (when resumed) — hard-won, don't re-litigate

1. **Lean first, not full parity.** Imperative router + `Link` + `useParams`/`useRoute` +
   route table — the verbs web devs reach for hourly. **DEFER loaders / actions / Await**:
   an SSR-shaped data layer on a platform with no SSR — worst native-fit, least needed (most
   RN apps fetch via `useEffect`/react-query). Loaders are the defer-candidate even *within*
   a future build.
2. **Anchor to Expo Router's shape (expo-router@55), NOT raw react-router.** Expo Router
   already solved "web routing on RN, on top of React Navigation" and is the emerging RN
   standard → aligning gives a free ecosystem lift (Expo tutorials / SO / LLM answers just
   work). Its web shape also makes the Vue/Angular reskins fall out naturally.
3. **ONE shape, lightly reskinned per framework** (`useRouter`/`useRoute` everywhere, `Link`
   vs `RouterLink`) — NOT three faithful web-router clones. Three vocabularies = 3× your own
   maintenance + no coherent Symbiote story.
4. **No naming collision.** Keep `useNavigation` = the React-Navigation hook (escape hatch,
   preserved). Add `useRouter()` as the NEW web hook returning the imperative router — Expo's
   exact no-collision pattern.
5. **Design principle — the facade REQUIRES a linking config as its route table** (name↔path,
   `:param`), exactly as react-router/vue-router require a route table. Natural fit, not a
   burden. Our `core/linking-config.ts` (`resolveRouteFromUrl`/`resolveUrlFromRoute`) is the
   seam — the twin of Expo's `getStateFromPath`/`getPathFromState`.
6. **Key risk — uncanny valley:** looks like vue-router but behaves like a native stack
   (back = native pop, not history; `push` vs `navigate`; `dismissTo`; `canDismiss` — concepts
   web routers lack). **Mitigation: honest docs about where it differs, never pretend 1:1.**
   Expo survives the leaky bridge only via a large team continuously plugging leaks — we can't
   match that maintenance, hence lean + honest.

## Vendored reference sources (under `~/projects/vendors`, symlinked `.vendors`)

| Lib | Path | Use |
|---|---|---|
| **expo-router@55.0.2** | `expo/packages/expo-router` | THE reference. `src/global-state/router.ts` (imperative router: push/navigate/replace/back/canGoBack/setParams/dismiss/dismissTo/dismissAll/reload/prefetch), `src/hooks.ts` (useRouter/usePathname/useSegments/useLocalSearchParams/useGlobalSearchParams), `src/link/`, `src/loaders/` (useLoaderData/LoaderCache) |
| react-router@8.2.0 | `react-router/packages/react-router` | web reference |
| vue-router | `vue-router/packages/router` | Vue reskin reference |
| @angular/router | `angular/packages/router` | Angular reskin reference |

## Expo test-suite audit (~60 files) — the port map (so it is NOT re-audited)

Expo's tests are **integration tests on Expo's architecture** (file-based routing via
`renderRouter`, its vendored React-Navigation fork, `store`/`routingQueue`/`navigationRef`,
jest). They are **not copy-paste**able — port the SCENARIOS, re-authored against OUR harness
(vitest + a `linking-config` route table + our engine handle).

**PORTABLE (~19) → future task:**
- **Imperative router (#4):** `global-state/__tests__/router.test.ios.ts`, `__tests__/push.test.ios.tsx`, `dismissTo.test.ios.tsx`, `stacks.test.ios.tsx` (canDismiss/dismiss/dismissAll), `prefetch.test.ios.tsx`
- **Location hooks (#5):** `__tests__/hooks.test.ios.tsx`, `search-params.test.ios.tsx`, `tabs.test.ios.tsx`, `hashs.test.ios.tsx`, `LocationProvider.test.ios.ts`, `global-state/__tests__/getRouteInfoFromState.test.ios.ts`, `issues.test.ios.tsx`
- **Link/Redirect (#6):** `link/__tests__/Link.test.ios.tsx`, `link/__tests__/Link.test.web.tsx`, `__tests__/redirects.test.ios.tsx`
- **Preserved RN hooks (#11):** `__tests__/useNavigation.test.ios.tsx`, `useFocusEffect.test.ios.tsx`
- **Full nav integration (#4/#5/#6):** `__tests__/navigation.test.ios.tsx`
- **Loaders (#3/#8):** `loaders/__tests__/getLoaderData.test.ts` — near-1:1 (LoaderCache fetch/dedupe/error-cache/suspense-promise-dedupe)

**MATCHER GAPS to add to `linking-config` while doing this** (from COVERED-with-gap):
optional params (`:id?`), catch-all/wildcard segments, regex-in-segment (`:id(\d+)`),
duplicate-pattern error detection, hash parsing, query-string serialization, baseUrl
stripping, `exact` configs, undefined-param stripping, wildcard host, url-as-query-param
preservation. Sources: `fork/__tests__/getStateFromPath*`, `getPathFromState*`,
`react-navigation/core/__tests__/{getPathFromState,getPatternParts}`,
`react-navigation/native/__tests__/extractPathFromURL`.

**NOT PORTABLE (~40, by design):** `react-navigation/**` (Expo's vendored RN FORK — we have
our own engine + reducers with their own tests), `__rsc_tests__/**` (no RSC),
`native-tabs/**` + `fork/native-stack/**` (Expo native fork), file-based routing
(`getRoutes`/`require-context`/`platform-routes`/`sitemap` — we use a config route table, not
a filesystem tree), `link/zoom/**` + `link/preview/**` (iOS zoom transitions + Link.Preview/
Menu context menu — deferred).

## The 18-task build plan (when resumed)

| # | Area | Task |
|---|---|---|
| 1 | CORE | Href type + `resolveHref()` (`string \| {pathname,params}` → `{name,params}` via linking-config) |
| 2 | CORE | pathname/segments + search-params helpers |
| 3 | CORE | loader contract (LoaderFunction, LoaderCache, `data()`) — *defer* |
| 4 | REACT | `useRouter()` + `router` (imperative) |
| 5 | REACT | location hooks (usePathname/useSegments/useLocalSearchParams/useGlobalSearchParams) |
| 6 | REACT | `Link href` + `Redirect` |
| 7 | REACT | `Slot` (Outlet) |
| 8 | REACT | loaders (useLoaderData + wire into Screen) — *defer* |
| 9 | REACT | barrel exports (keep RN hooks as escape hatch) |
| 10 | REACT | `.examples/react` wiring + smoke |
| 11 | REACT | facade tests (port the scenarios above) |
| 12 | VUE | `useRouter()`/`useRoute()` |
| 13 | VUE | `RouterLink to` / `RouterView` (Slot) |
| 14 | VUE | loaders + onBeforeRouteLeave/Update guards — *defer loaders* |
| 15 | ANGULAR | `inject(Router).navigate` + `routerLink` directive |
| 16 | ANGULAR | `router-outlet` + `inject(ActivatedRoute)` |
| 17 | ANGULAR | loaders via Resolve + CanActivate* guards — *defer loaders* |

Start order when resumed: the lean verbs — #1, #2, #4, #5, #6, #7 (+ Vue/Angular
equivalents). Prove it in ONE live example, feel it (familiar or uncanny valley?), THEN
decide whether to extend across all adapters and whether loaders earn their keep.

## First step when resumed (concrete)

Re-create `core/href.ts` (Href type + `resolveHref`) and `core/search-params.ts` (query
parse/stringify + `segmentsFromPathname`) — both existed in the deferral session, were
verified (15 vitest cases green), then reverted to keep the beta package minimal. `resolveHref`
normalizes either Href form to `{name, params}`: path params via `resolveRouteFromUrl`,
query/object params merged on top. This is ~1 file each; the git history of this branch has
the exact reverted content if needed.
