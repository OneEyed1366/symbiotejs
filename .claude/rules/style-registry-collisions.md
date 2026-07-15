---
paths:
  - ".examples/*/App.css"
  - ".examples/*/components/*.css"
  - ".examples/*/**/*.vue"
---

# Shared CSS class registry — check the whole app, not just this file

`core/engine/src/style-registry`'s registry is one flat `Map` shared across
every CSS source in an app; a same-named class in `App.css` and a
`components/*.css` file collide silently, and whichever registers LAST
(import order, not file position) wins — no build error, no warning. Before
changing a class-tied style/color here, grep the WHOLE app for that class
name, not just this file. Full incident + mechanics: invoke the
`symbiote-sfc-style-compiler` skill (§9, "Cross-file class-name collisions").
