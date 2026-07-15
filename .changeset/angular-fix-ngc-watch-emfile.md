---
"@symbiote-native/angular": patch
---

Fix `symbiote-angular-dev.cjs` spawning `ngc --watch` against a tsconfig whose `angularCompilerOptions.basePath` chokidar recursively watches — previously the project root, a sibling of `ios`/`android`'s tens of thousands of generated files, crashing with `EMFILE: too many open files, watch`. The script now resolves the real tsconfig's `basePath` and, if it's relative, writes a throwaway absolute-basePath override config into the app's own `build/` directory before spawning watch mode — `@angular/compiler-cli`'s incremental-recompile path throws `TS500: ... path is not absolute` otherwise on the second file change onward, even though the cold compile tolerates a relative `basePath` fine.
