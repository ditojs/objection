#!/usr/bin/env node
// Converts objection from CommonJS to ES modules: runs the codemods, then
// applies the residual patch with the changes they don't make. See README.md.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const usage = `Usage: node scripts/esm/migrate.mjs [options]

  (no option)        Migrate the checkout in the current directory, which must
                     be clean, and update package-lock.json with npm. The
                     result is staged.
  --skip-lockfile    Leave package-lock.json as it is when migrating.
  --update-patch     Regenerate residual.patch: the diff from the codemods'
                     output on --base (default: origin/main) to --target.
  --verify           Migrate a temporary worktree of --base (default: the
                     patch's base) and compare the result with --target,
                     apart from what the patch leaves out.

  --base <ref>       See above.
  --target <ref>     Default: origin/esm
  --dir <path>       The checkout to work on. Default: the current directory.
  -h, --help`;

const { values: options } = parseArgs({
  options: {
    'update-patch': { type: 'boolean' },
    verify: { type: 'boolean' },
    'skip-lockfile': { type: 'boolean' },
    base: { type: 'string' },
    target: { type: 'string', default: 'origin/esm' },
    dir: { type: 'string', default: process.cwd() },
    help: { type: 'boolean', short: 'h' },
  },
});

if (options.help) {
  console.log(usage);
  process.exit(0);
}

// The codemods need the dependencies of these scripts, which aren't part of
// objection's own.
if (!fs.existsSync(path.join(import.meta.dirname, 'node_modules'))) {
  const dir = path.relative(process.cwd(), import.meta.dirname) || '.';
  console.error(`Install the dependencies first: npm ci --prefix ${dir}`);
  process.exit(1);
}

const { migrate, updatePatch, verify } = await import('./lib/commands.js');
const log = (message) => console.log(message);

try {
  const command = options['update-patch'] ? updatePatch : options.verify ? verify : migrate;
  process.exitCode = (await command({ ...options, lockfile: !options['skip-lockfile'], log }))
    ? 0
    : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
