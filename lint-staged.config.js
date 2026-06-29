// Runs on the staged set at commit time (via husky pre-commit → lint-staged).
//
//   library .ts/.tsx  → eslint --fix, then prettier --write
//   other source/json → prettier --write
//   any .ts/.tsx       → tsc --build once (a project-references solution can't be
//                        type-checked file-by-file, so we typecheck the whole graph)
//
// examples/* are linted+formatted by their own @react-native toolchain, so the eslint
// rule below scopes to the library packages only; prettier still tidies root configs.
//
// Touching any manifest or the catalog → syncpack guards that no literal version
// slipped past the pnpm catalog (it scans the whole workspace, so args are ignored).
export default {
  '{core,adapters,packages}/**/*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '{core,adapters,packages}/**/*.{js,json}': 'prettier --write',
  '*.{ts,js,json}': 'prettier --write',
  '**/*.{ts,tsx}': () => 'tsc --build',
  '{**/package.json,pnpm-workspace.yaml}': () => 'syncpack lint',
};
