// Vendors db-errors into lib/dbErrors as ES modules, and points the requires of
// db-errors to it. Each module gets a named export: the error classes by their
// names, the parsers as `<error>Parser` and the error code sets as
// `<dialect>ErrorCodes`.

import { createRequire } from 'node:module';
import path from 'node:path';
import { createFileAccess, toPosix } from '../lib/files.js';
import { JsonEditor } from '../lib/json.js';
import { convertCommonJs } from './commonJs.js';

export const description = 'vendor db-errors into lib/dbErrors';

const target = 'lib/dbErrors';

export function run(access) {
  removeDependency(access);
  // Vendored already, maybe with changes from the residual patch.
  if (access.exists(`${target}/index.js`)) {
    return [];
  }
  copyPackage(access);
  bypassErrorCodesIndex(access);
  const files = access.list(target, (file) => file.endsWith('.js'));
  const skipped = convertCommonJs(files, access, {
    singleExport: 'named',
    exportName,
    inlineRequires: true,
  });
  redirectRequires(access);
  return skipped;
}

// Copies the package's lib/ and license from the version installed for these
// scripts, with the entry point as index.js.
function copyPackage(access) {
  const require = createRequire(import.meta.url);
  const packageDir = path.dirname(require.resolve('db-errors/package.json'));
  const source = createFileAccess(packageDir);
  for (const file of source.list('lib')) {
    const name = file === 'lib/dbErrors.js' ? 'index.js' : path.posix.relative('lib', file);
    access.write(`${target}/${name}`, source.read(file));
  }
  access.write(`${target}/LICENSE`, source.read('LICENSE'));
}

// The parsers get their error codes through errorCodes/index.js, e.g.
// `const errorCodes = require('../../../errorCodes').postgres`. They import the
// dialect's module directly instead, under its export name.
function bypassErrorCodesIndex(access) {
  const pattern = /^const errorCodes = require\('((?:\.\.\/)+errorCodes)'\)\.(\w+);$/m;
  for (const file of access.list(`${target}/parsers`)) {
    const source = access.read(file);
    const match = pattern.exec(source);
    if (match) {
      const [statement, directory, dialect] = match;
      const name = `${dialect}ErrorCodes`;
      access.write(
        file,
        source
          .replace(statement, `const ${name} = require('${directory}/${dialect}');`)
          .replace(/\berrorCodes\./g, `${name}.`),
      );
    }
  }
  access.remove(`${target}/errorCodes/index.js`);
}

// The name to export a parser or error code module by. The error classes are
// exported by their own names.
function exportName(file) {
  const [dir, base] = file.split('/').slice(-2);
  if (base === 'parser.js') {
    return `${lowerFirstWord(dir)}Parser`;
  }
  if (dir === 'errorCodes') {
    return `${path.posix.basename(base, '.js')}ErrorCodes`;
  }
  return null;
}

// `CheckViolationError` -> `checkViolationError`, `DBError` -> `dbError`
function lowerFirstWord(name) {
  return name.replace(/^[A-Z]+(?=[A-Z][a-z])|^[A-Z]/, (word) => word.toLowerCase());
}

// Points the requires of db-errors in the rest of the code to lib/dbErrors.
function redirectRequires(access) {
  const files = ['lib', 'testUtils', 'tests'].flatMap((dir) =>
    access.list(dir, (file) => file.endsWith('.js') && !file.startsWith(`${target}/`)),
  );
  for (const file of files) {
    const source = access.read(file);
    if (source.includes("require('db-errors')")) {
      let relative = toPosix(path.relative(path.dirname(file), target));
      relative = relative.startsWith('.') ? relative : `./${relative}`;
      access.write(file, source.replaceAll("require('db-errors')", `require('${relative}')`));
    }
  }
}

function removeDependency(access) {
  const source = access.read('package.json');
  const edited = new JsonEditor(source).remove(['dependencies', 'db-errors']).toString();
  if (edited !== source) {
    access.write('package.json', edited);
  }
}
