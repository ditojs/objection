// Generates the Peggy parsers in lib/ as ES modules: switches the
// `build:parsers` script from `--format commonjs` to `--format es`, and
// regenerates the parsers it lists with the Peggy of these scripts, which has to
// be the version that the script uses, so that CI's check of the generated
// parsers passes. The parsers' CommonJS was converted by the lib/ codemod, but
// differs from what Peggy generates.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { JsonEditor } from '../lib/json.js';

export const description = 'Peggy parsers as ES modules';

const require = createRequire(import.meta.url);

export function run(access) {
  if (!access.exists('package.json')) {
    return [];
  }
  const source = access.read('package.json');
  const json = new JsonEditor(source);
  const script = json.get(['scripts', 'build:parsers']);
  if (!script?.includes('--format commonjs')) {
    return [];
  }
  const left = [];
  const { version } = require('peggy/package.json');
  if (!script.includes(`peggy@${version}`)) {
    left.push(`build:parsers doesn't use peggy@${version}, the parsers aren't regenerated`);
  }
  const updated = script.replaceAll('--format commonjs', '--format es');
  access.write('package.json', json.set(['scripts', 'build:parsers'], updated).toString());
  if (left.length > 0) {
    return left;
  }
  const bin = require.resolve('peggy/bin/peggy.js');
  for (const [, output, grammar] of updated.matchAll(/-o (\S+) (\S+\.pegjs)/g)) {
    execFileSync(process.execPath, [bin, '--format', 'es', '-o', output, grammar], {
      cwd: access.root,
    });
    // Marks the parser as changed, so that the format codemod formats it.
    access.write(output, access.read(output));
  }
  return left;
}
