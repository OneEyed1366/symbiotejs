# symbiote Angular canary

Minimal React Native host app that mounts an Angular standalone component through
`@symbiotejs/angular`.

The app imports its standalone host intrinsics and composed components from the public
`@symbiotejs/angular` surface, then `ngc` compiles the app against the adapter's partial-Ivy
output.

Angular uses the two-stage Variant 1 build pipeline:

1. `pnpm ng:build` runs `ngc -p tsconfig.angular.json` and emits partial-Ivy JS to
   `build/angular/`.
2. Metro loads `index.js`, which imports `build/angular/App.js`.
3. `babel.config.js` runs `@angular/compiler-cli/linker/babel` so Hermes receives
   full Ivy instructions.

Run:

```bash
pnpm ng:build
pnpm start
pnpm ios
pnpm android
```
