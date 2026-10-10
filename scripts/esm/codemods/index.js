// The codemods, in the order they run.

import * as dbErrors from './dbErrors.js';
import * as lib from './lib.js';
import * as parsers from './parsers.js';
import * as typings from './typings.js';
import * as tests from './tests.js';
import * as expectToVitest from './expectToVitest.js';
import * as doneCallbacks from './doneCallbacks.js';
import * as mochaContext from './mochaContext.js';
import * as vitestGlobals from './vitestGlobals.js';
import * as typeScriptImports from './typeScriptImports.js';
import * as examples from './examples.js';
import * as docs from './docs.js';
import * as config from './config.js';
import * as format from './format.js';

export const codemods = [
  dbErrors,
  lib,
  parsers,
  typings,
  tests,
  expectToVitest,
  doneCallbacks,
  mochaContext,
  vitestGlobals,
  typeScriptImports,
  examples,
  docs,
  config,
  format,
];

// Runs the codemods on the checkout that `access` reads and writes, and returns
// what they left for the residual patch.
export async function runCodemods(access, { log = () => {} } = {}) {
  const skipped = [];
  for (const codemod of codemods) {
    log(`  ${codemod.description}`);
    for (const message of await codemod.run(access)) {
      skipped.push(`${codemod.description}: ${message}`);
    }
  }
  return skipped;
}
