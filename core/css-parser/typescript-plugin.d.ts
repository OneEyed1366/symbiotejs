// Ambient type for the hand-written CommonJS plugin (typescript-plugin.cjs) — deliberately loose
// (the tsserver plugin-init shape isn't worth pulling `typescript/lib/tsserverlibrary`'s types
// into every consumer just to describe a function no one calls directly; tsserver itself invokes
// it by convention, matched by shape, not by this declaration).
declare function initTypeScriptPlugin(modules: { typescript: unknown }): {
  create: (info: unknown) => unknown;
};
export = initTypeScriptPlugin;
