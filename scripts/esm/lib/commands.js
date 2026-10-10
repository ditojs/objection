// The commands of migrate.mjs. Each returns whether it succeeded.

import fs from 'node:fs';
import path from 'node:path';
import { isEsModule } from '../codemods/commonJs.js';
import {
  applyResidualPatch,
  createResidualPatch,
  describeLeftOut,
  diffPathspec,
  patchBase,
  patchFile,
  runCodemodStep,
  targetTree,
  updateLockfile,
} from './migration.js';
import {
  diffOptions,
  git,
  isClean,
  repositoryRoot,
  resolveCommit,
  stageAll,
  withTemporaryWorktree,
} from './git.js';

// Migrates the checkout in `dir`.
export async function migrate({ dir, lockfile = true, log }) {
  const root = repositoryRoot(dir);
  if (!isClean(root)) {
    throw new Error(`${root} has uncommitted changes. Migrate a clean checkout.`);
  }
  return runMigration(root, { lockfile, log });
}

async function runMigration(root, { lockfile, log }) {
  const entry = path.join(root, 'lib/objection.js');
  if (fs.existsSync(entry) && isEsModule(fs.readFileSync(entry, 'utf8'))) {
    throw new Error(`${root} is migrated already: lib/ consists of ES modules.`);
  }
  log('running the codemods');
  await runCodemodStep(root, { log });
  log(`applying ${path.basename(patchFile)}`);
  const conflicts = await applyResidualPatch(root, { log });
  if (conflicts.length) {
    log(
      [
        `The residual patch conflicts in ${conflicts.length} files:`,
        ...conflicts.map((file) => `  ${file}`),
        'Resolve the conflict markers in them, or update the codemods and the patch.',
        "Files that the checkout deleted have no markers: the patch's changes to them are left out.",
        lockfile ? 'Then run `npm install --package-lock-only`.' : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    return false;
  }
  if (lockfile && !updateLockfile(root, { log })) {
    return false;
  }
  log('done, the migrated files are staged');
  return true;
}

// Regenerates the residual patch from `base` and `target`.
export async function updatePatch({ dir, base = 'origin/main', target, log }) {
  const repo = repositoryRoot(dir);
  const patch = await createResidualPatch(repo, { base, target, log });
  fs.writeFileSync(patchFile, patch);
  const files = patch.match(/^diff --git /gm)?.length ?? 0;
  log(
    `wrote ${path.relative(process.cwd(), patchFile)}: ${files} files, ${patch.split('\n').length} lines`,
  );
  return true;
}

const maxDiffLines = 400;

// Migrates a temporary worktree of `base`, by default the patch's base, and
// compares the result with `target`, apart from what the patch leaves out.
export async function verify({ dir, base = patchBase(), target, log }) {
  const repo = repositoryRoot(dir);
  if (!base) {
    throw new Error(`${path.basename(patchFile)} records no base. Pass --base.`);
  }
  const targetCommit = resolveCommit(repo, target);
  return withTemporaryWorktree(repo, resolveCommit(repo, base), async (worktree) => {
    log(`migrating ${base} in a temporary worktree`);
    // The lockfile is left out of the comparison.
    if (!(await runMigration(worktree, { lockfile: false, log }))) {
      return false;
    }
    stageAll(worktree);
    const tree = targetTree(worktree, targetCommit, { log });
    const ignored = [
      `Compared with ${target}, ignoring what the patch leaves out:`,
      ...describeLeftOut().map((line) => `  ${line}`),
    ].join('\n');
    const pathspec = diffPathspec();
    const differences = git(worktree, ['diff', '--cached', '--stat', tree, ...pathspec]);
    log(ignored);
    if (differences.trim()) {
      const diff = git(worktree, ['diff', '--cached', ...diffOptions, tree, ...pathspec]);
      const lines = diff.split('\n');
      log(`The result differs from ${target}:\n${differences}`);
      log(lines.slice(0, maxDiffLines).join('\n'));
      if (lines.length > maxDiffLines) {
        log(`… ${lines.length - maxDiffLines} more lines`);
      }
      return false;
    }
    log(`The result is identical to ${target}, apart from that.`);
    return true;
  });
}
