// Fixes the imports of the TypeScript tests for `"module": "nodenext"`: local
// modules are imported with their `.js` extension, the package and its typings
// by the package's name.

import path from 'node:path';

export const description = 'TypeScript imports for nodenext';

const importFrom = /(\bfrom ')(\.[^']*)(')/g;
const typings = 'typings/objection';

export function run(access) {
  for (const file of access.list('tests/ts', (file) => file.endsWith('.ts'))) {
    const source = access.read(file);
    const fixed = fixTypeScriptImports(file, source, access);
    if (fixed !== source) {
      access.write(file, fixed);
    }
  }
  return [];
}

export function fixTypeScriptImports(file, source, access) {
  return fixAjvImport(
    source.replace(importFrom, (match, before, specifier, after) => {
      const target = path.posix.join(path.posix.dirname(file), specifier);
      if (path.posix.join(target, '.') === '.' || target === typings) {
        return `${before}objection${after}`;
      }
      return access.exists(`${target}.ts`) || access.exists(`${target}.d.ts`)
        ? `${before}${specifier}.js${after}`
        : match;
    }),
  );
}

// Under nodenext, ajv's default export is the module object, so the class is
// imported by name: `import Ajv, { Options } from 'ajv'` -> `import { Ajv, Options } from 'ajv'`.
function fixAjvImport(source) {
  return source
    .replace(/^import Ajv from 'ajv';$/m, "import { Ajv } from 'ajv';")
    .replace(/^import Ajv, \{ (.*) \} from 'ajv';$/m, "import { Ajv, $1 } from 'ajv';");
}
