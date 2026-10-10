import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs git in `cwd` and returns its output. With `allowFailure`, returns
// `{ status, output }` instead of throwing. `input` is passed on stdin, `env`
// adds environment variables.
export function git(cwd, args, { allowFailure = false, input, env } = {}) {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      input,
      env: env && { ...process.env, ...env },
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    return allowFailure ? { status: 0, output } : output;
  } catch (error) {
    if (!allowFailure) {
      throw new Error(`git ${args.join(' ')} failed:\n${error.stderr || error.message}`);
    }
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

export function repositoryRoot(dir) {
  return git(dir, ['rev-parse', '--show-toplevel']).trim();
}

export function resolveCommit(repo, ref) {
  return git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
}

export function isClean(repo) {
  return git(repo, ['status', '--porcelain']).trim() === '';
}

// Stages everything, which also stores the files' blobs in the repository, and
// returns the tree.
export function stageAll(repo) {
  git(repo, ['add', '-A']);
  return git(repo, ['write-tree']).trim();
}

// Runs `fn(dir)` with a temporary detached worktree of `ref`, and removes the
// worktree afterwards.
export async function withTemporaryWorktree(repo, ref, fn) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'objection-esm-'));
  const dir = path.join(parent, 'worktree');
  git(repo, ['worktree', 'add', '--quiet', '--detach', dir, ref]);
  try {
    return await fn(dir);
  } finally {
    git(repo, ['worktree', 'remove', '--force', dir], { allowFailure: true });
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

// Options that keep the diff output independent of the user's git config.
export const diffOptions = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--find-renames',
  '--full-index',
  '--binary',
];
