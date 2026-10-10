# ES module migration

Converts objection from CommonJS (`main`) to ES modules (the `esm` branch, see
ditojs/objection#140) in two steps:

1. **Codemods** make the mechanical changes, so that they also apply to code
   that `main` gains later.
2. **`residual.patch`** holds everything else: hand-written files and edits,
   such as the circular import registration in `getModel.js` and
   `getJoinBuilder.js`, `resolveModel.js`, `clone.js`, the typings of the
   database errors, `tests/main.js`, tests that need other assertions under
   vitest, CI, the prose of the docs and what the `esm` branch changed beyond
   the conversion, e.g. in the examples. It is applied with a 3-way merge, so
   that changes on `main` merge with it like with any other change.

The patch leaves out what only belongs on the `esm` branch or is generated (see
`leftOut` in `lib/migration.js`): `package-lock.json`, which the migration
updates with `npm install --package-lock-only` instead, the branches CI runs on
in `.github/workflows/test.yml`, and `.github/workflows/docs.yml`, where `esm`
only stops the docs deployment. `--verify` ignores these parts.

## Usage

Install the dependencies of these scripts (acorn, magic-string, prettier,
db-errors and peggy, in the versions the conversion is made with):

```sh
npm ci --prefix scripts/esm
```

Then, from the root of a clean checkout:

```sh
# Migrate the checkout and update package-lock.json with npm (which needs the
# network, or pass --skip-lockfile). The result is staged, for review with
# `git diff --cached`.
node scripts/esm/migrate.mjs

# Regenerate residual.patch after `main` or `esm` changed: the diff from the
# codemods' output on --base to --target.
node scripts/esm/migrate.mjs --update-patch [--base origin/main] [--target origin/esm]

# The acceptance test: migrate a temporary worktree of --base and compare the
# result with --target, which must be identical apart from the parts the patch
# leaves out. --base defaults to the base recorded in the patch, as `esm`
# doesn't have the commits that `main` gained since.
node scripts/esm/migrate.mjs --verify [--base <patch base>] [--target origin/esm]
```

The migration refuses to run on a checkout that is migrated already.

`--dir <path>` works on another checkout than the current directory. These
scripts can live in a different checkout than the one they migrate, and they
leave `scripts/esm` out of all diffs.

## Conflicts

If the residual patch conflicts with changes on `main`, the migration stops
with the conflicted files listed, which contain the usual conflict markers. For
the 3-way merge, the repository needs the files the patch was made against, the
codemods' output on the base commit recorded in the patch's header. If they're
missing, the migration recreates them in a temporary worktree of that commit.
Files that the patch deletes and that `main` deleted already are skipped.
Files that the patch changes but `main` deleted are reported as conflicts, like
git's modify/delete conflicts, and the patch's changes to them are left out.

A change on `main` that a codemod covers needs no attention. For a conflict in
hand-made changes, resolve it on the `esm` branch, then update the patch. The
changes that the `esm` branch made beyond the conversion belong on `main`: once
they land there and `esm` has the same version, they drop out of the patch.

## Codemods

They run in this order (see `codemods/index.js`). Each leaves alone what it
converted already, so running them again on their output changes nothing:

- `dbErrors.js`: vendors db-errors 0.2.3 into `lib/dbErrors` as ES modules
  with named exports, unless it exists, points the requires of `db-errors` to
  it, and removes the dependency.
- `lib.js`: converts `lib/` with the engine in `commonJs.js`: imports with
  file extensions, `export` at the declarations, `export … from` for
  re-exports, no `'use strict'`. Removes `lib/.eslintrc.json`.
- `parsers.js`: switches the `build:parsers` script to `--format es` and
  regenerates the Peggy parsers with it, with the Peggy version of these
  scripts, so that CI's check of the generated parsers passes.
- `typings.js`: moves the declarations of `namespace Objection` to the top
  level of the typings, with `export`.
- `tests.js`: converts the tests and `testUtils/` with `commonJs.js`, importing
  the package as `objection`. Renames the `#1234.js` tests to `issue1234.js`.
  The model files that the relation tests load by path stay CommonJS, and the
  tests get `require()` for them from `createRequire()`.
- `expectToVitest.js`: converts expect.js and chai assertions to vitest's
  `expect`, and expect.js's throw callbacks to `expectThrows()`, which it adds
  to `testUtils/testUtils.js`.
- `doneCallbacks.js`: converts tests with a `done` callback to tests that
  return their promise, when all calls of `done` are in callbacks the returned
  promise waits for, or to `expect(promise).rejects` when they only check that
  the promise rejects.
- `mochaContext.js`: converts `this.skip()` and `this.timeout()` of mocha to
  `it.skipIf()` and timeout arguments, and the test functions that no longer
  use `this` to arrow functions.
- `vitestGlobals.js`: renames mocha's `before` and `after` hooks, and imports
  the test functions from vitest.
- `typeScriptImports.js`: adds the `.js` extensions to the imports of the
  TypeScript tests, for `nodenext`, and imports the typings as `objection`.
- `examples.js`: converts the example projects with `commonJs.js`, adds the
  `.js` extensions to the imports of their TypeScript, and makes their
  `package.json` an ES module package.
- `docs.js`: converts the code examples in the docs and in the READMEs of the
  examples with `commonJs.js`, and turns `static relationMappings = { … }`
  into getters, which circular imports need.
- `config.js`: edits `package.json`, `tsconfig.json` and `.eslintrc.json` for
  ES modules and vitest, and adds the files in `templates/`, e.g.
  `vitest.config.js` and `testUtils/setup.js`, unless they exist.
- `format.js`: formats the changed files with prettier.

The migration prints what the codemods left for the patch, e.g. assertions
without a vitest equivalent, `exports.x = …` inside functions, inline requires
whose import name is taken, or `done` callbacks used in event handlers or
timers. When a codemod learns to handle more, regenerate the patch, which then
gets smaller, and check the result with `--verify`.
