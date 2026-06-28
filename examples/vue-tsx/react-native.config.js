// Manual-link @symbiote/android into the canary's Android autolinking. The canary
// resolves @symbiote/* through Metro's extraNodeModules (source, never installed into
// node_modules), so the RN CLI (which scans node_modules) can't discover this native
// package on its own. Pointing `root` at the monorepo path makes autolinking treat it as
// a normal native dependency without a publish/install step. The future create-symbiote
// scaffolder lists @symbiote/android as a real dependency, so generated apps autolink it
// the ordinary way and need no entry here.
const path = require('path');

module.exports = {
  dependencies: {
    '@symbiote/android': {
      root: path.resolve(__dirname, '../../packages/android'),
    },
  },
};
