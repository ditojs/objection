// Checks that editors suggest the columns of the model in the first argument
// of the query builder methods, as a string and as an object key, in loose and
// strict mode. tsc can't check this, so we ask the language service of
// TypeScript 5, as TypeScript 7 has none in JavaScript yet.
//
//   node tests/ts/completions.js

import path from 'node:path';
import ts from 'typescript-5';

const root = path.resolve(import.meta.dirname, '../..');

const columns = ['id', 'firstName', 'age'];
const methodsByMode = {
  loose: [
    'where',
    'andWhere',
    'orWhere',
    'whereNot',
    'whereLike',
    'whereILike',
    'whereIn',
    'whereNotIn',
    'whereColumn',
    'findOne',
    'having',
    'jsonSet',
    'select',
  ],
  strict: [
    'where',
    'findOne',
    'having',
    'whereLike',
    'whereIn',
    'select',
    'whereColumn',
    'jsonSet',
    'whereJsonSupersetOf',
  ],
};
const objectMethods = ['where', 'findOne', 'having'];

const file = path.join(root, 'tests/ts/completions.ts');
const options = {
  strict: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  types: [],
  noEmit: true,
};

for (const [mode, methods] of Object.entries(methodsByMode)) {
  // Write one call per method, and remember where its column goes:
  let source =
    "import { Model } from 'objection';\n" +
    (mode === 'strict'
      ? "declare module 'objection' { interface TypeConfig { strict: true } }\n"
      : '') +
    'class Person extends Model {\n' +
    '  id!: number;\n' +
    '  firstName!: string;\n' +
    '  age?: number;\n' +
    '}\n';
  const positions = {};
  const addCall = (name, call, end) => {
    positions[name] = source.length + call.length;
    source += `${call}${end});\n`;
  };
  for (const method of methods) {
    addCall(`${method}()`, `Person.query().${method}('`, "'");
  }
  for (const method of objectMethods) {
    addCall(`${method}({})`, `Person.query().${method}({ `, ' }');
  }
  const service = ts.createLanguageService({
    getScriptFileNames: () => [file],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) =>
      name === file
        ? ts.ScriptSnapshot.fromString(source)
        : ts.sys.fileExists(name)
          ? ts.ScriptSnapshot.fromString(ts.sys.readFile(name))
          : undefined,
    getCurrentDirectory: () => root,
    getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: (name) => name === file || ts.sys.fileExists(name),
    readFile: (name) => (name === file ? source : ts.sys.readFile(name)),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  });
  for (const [name, position] of Object.entries(positions)) {
    const completions = service.getCompletionsAtPosition(file, position, {});
    const names = new Set(completions?.entries.map((entry) => entry.name));
    const missing = columns.filter((column) => !names.has(column));
    if (missing.length > 0) {
      console.error(`${mode} ${name}: no completions for ${missing.join(', ')}`);
      process.exitCode = 1;
    }
  }
}
