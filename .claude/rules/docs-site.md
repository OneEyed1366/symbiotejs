---
paths:
  - "apps/docs-site/**/*.mdx"
  - "apps/docs-site/**/*.md"
---

# docs-site — install snippets

Docs are read by real consumers installing symbiote packages from npm, who have
no pnpm workspace and no `workspace:*` protocol. Never write `"workspace:*"`
(or any other monorepo-internal version specifier) in a docs-site code
snippet. Show a real install command instead: `pnpm add @symbiote-native/<pkg>` /
`pnpm add -D @symbiote-native/<pkg>` — no version pinned, `package.json` only shows
fields the reader actually needs to add by hand (e.g. a `scripts` entry).

# docs-site — package-page template

Every `docs/packages/<pkg>.mdx` page follows one canonical section order and always has a
`## API` heading (never `## Props` / ad-hoc names) with a filled human-readable Description on
every table row — invoke the `symbiote-docs-site-package-template` skill before writing or
restructuring one.
