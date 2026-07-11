// The color-keyed style processors (box-shadow/filter/background-image) used to import
// processColor back from commit.ts, which itself imports them to build STYLE_PROCESSORS - a
// real 2-hop dependency cycle, held together only by "no TDZ hazard" comments (processColor was
// only ever called at runtime, never at module-init). platform-color.ts is the stable leaf that
// owns color processing now, so none of these three should reach into commit.ts anymore. A
// static source-text check (no madge in this repo) is enough: the offending import is a literal
// string, not a dynamic path.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const engineSrc = path.dirname(fileURLToPath(import.meta.url));

const filesThatUsedToCycleThroughCommit = [
  path.join(engineSrc, '../process-box-shadow/index.ts'),
  path.join(engineSrc, '../process-filter.ts'),
  path.join(engineSrc, '../process-background-image/index.ts'),
];

describe('process-* color processors no longer cycle through commit.ts', () => {
  for (const filePath of filesThatUsedToCycleThroughCommit) {
    it(`${path.relative(engineSrc, filePath)} does not import from commit`, () => {
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toContain("from '../commit'");
      expect(source).not.toContain("from './commit'");
    });
  }
});
