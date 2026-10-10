// Replaces mocha's global hooks with vitest's, and imports the test functions
// from vitest, which doesn't provide them as globals.

import MagicString from 'magic-string';
import { isReference, parseModule, patternNames, walk } from '../lib/ast.js';
import { testFiles } from './tests.js';

export const description = 'mocha globals to vitest imports';

const renamedHooks = new Map([
  ['before', 'beforeAll'],
  ['after', 'afterAll'],
]);

// The order in which they are imported.
const vitestGlobals = [
  'describe',
  'it',
  'expect',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
];

export function run(access) {
  for (const file of testFiles(access)) {
    const source = access.read(file);
    const code = convertGlobals(source);
    if (code !== source) {
      access.write(file, code);
    }
  }
  return [];
}

function convertGlobals(source) {
  const program = parseModule(source);
  const code = new MagicString(source);
  const used = new Set();
  walk(program, (node, parents) => {
    const parent = parents.at(-1);
    if (
      node.type !== 'Identifier' ||
      !isReference(node, parent) ||
      isDeclared(node.name, parents)
    ) {
      return;
    }
    const renamed = renamedHooks.get(node.name);
    if (renamed && parent.type === 'CallExpression' && parent.callee === node) {
      code.overwrite(node.start, node.end, renamed);
      used.add(renamed);
    } else if (vitestGlobals.includes(node.name)) {
      used.add(node.name);
    }
  });
  const imported = vitestGlobals.filter((name) => used.has(name));
  if (imported.length) {
    code.prepend(`import { ${imported.join(', ')} } from 'vitest';\n`);
  }
  return code.toString();
}

// Whether one of the scopes around a reference declares its name, e.g. the
// parameter of `(it) => it.id`.
function isDeclared(name, parents) {
  return parents.some((scope) => {
    if (/Function/.test(scope.type)) {
      return scope.params.some((param) => patternNames(param).includes(name));
    }
    if (scope.type === 'Program' || scope.type === 'BlockStatement') {
      return scope.body.some((statement) => declaresName(statement, name));
    }
    return false;
  });
}

function declaresName(statement, name) {
  switch (statement.type) {
    case 'ImportDeclaration':
      return statement.specifiers.some((specifier) => specifier.local.name === name);
    case 'VariableDeclaration':
      return statement.declarations.some((declarator) =>
        patternNames(declarator.id).includes(name),
      );
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return statement.id.name === name;
    default:
      return false;
  }
}
