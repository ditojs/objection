// Converts the tests and test utilities from CommonJS to ES modules.

import path from 'node:path';
import { isIdentifier, isReference, parseModule, walk } from '../lib/ast.js';
import { convertCommonJs, isEsModule } from './commonJs.js';

export const description = 'tests to ES modules';

// The model files that tests/unit/relations loads by path stay CommonJS.
const commonJsFixtures = 'tests/unit/relations/files/';

export function run(access) {
  renameIssueTests(access);
  const files = testFiles(access);
  const skipped = convertCommonJs(files, access, {
    packageName: 'objection',
    inlineRequires: true,
    importMeta: true,
    commonJsPackages: ['knex'],
    // Like the requires of knex that are assigned to a variable.
    packageImportNames: { knex: 'Knex' },
    keepsRequire: (file) => file.startsWith(commonJsFixtures),
  });
  files.forEach((file) => provideRequire(file, access));
  keepCommonJsFixtures(access);
  return skipped;
}

export function testFiles(access) {
  return ['testUtils', 'tests'].flatMap((dir) =>
    access.list(
      dir,
      (file) =>
        file.endsWith('.js') && !file.startsWith(commonJsFixtures) && !file.startsWith('tests/ts/'),
    ),
  );
}

// `#1074.js` -> `issue1074.js`, as `#` has a meaning in import specifiers.
function renameIssueTests(access) {
  for (const file of access.list('tests', (file) => path.posix.basename(file).startsWith('#'))) {
    const name = path.posix.basename(file).replace(/^#/, 'issue');
    access.rename(file, path.posix.join(path.posix.dirname(file), name));
  }
}

// The tests that load the CommonJS model files with `require()` get it from
// `createRequire()`.
function provideRequire(file, access) {
  const source = access.read(file);
  const dir = path.posix.relative(path.posix.dirname(file), commonJsFixtures);
  if (!isEsModule(source) || !requiresFrom(source, `${dir}/`)) {
    return;
  }
  const program = parseModule(source);
  const lastImport = program.body.findLast((node) => node.type === 'ImportDeclaration');
  const end = lastImport?.end ?? 0;
  const text = [
    "import { createRequire } from 'node:module';",
    '',
    `// The model files in ./${dir} are CommonJS modules.`,
    'const require = createRequire(import.meta.url);',
  ].join('\n');
  access.write(file, `${source.slice(0, end)}\n${text}${source.slice(end)}`);
}

// Whether the module calls an undeclared `require()` with a path in `dir`.
function requiresFrom(source, dir) {
  let calls = false;
  walk(parseModule(source), (node, parents) => {
    const parent = parents.at(-1);
    if (isIdentifier(node, 'require') && isReference(node, parent)) {
      const isCall = parent.type === 'CallExpression' && parent.callee === node;
      const [argument] = isCall ? parent.arguments : [];
      calls ||= Boolean(argument && source.slice(argument.start, argument.end).includes(dir));
    }
  });
  return calls && !/^const require = /m.test(source);
}

// The model files stay CommonJS in a package that is otherwise ES modules.
function keepCommonJsFixtures(access) {
  const file = `${commonJsFixtures}package.json`;
  if (!access.exists(file)) {
    access.write(file, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
  }
}
