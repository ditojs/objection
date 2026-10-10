// Converts the example projects to ES modules: their JavaScript with the engine
// in commonJs.js, the imports of their TypeScript for `"module": "nodenext"`,
// and their package.json.

import path from 'node:path';
import { JsonEditor } from '../lib/json.js';
import { convertCommonJs } from './commonJs.js';
import { node } from './config.js';

export const description = 'examples to ES modules';

const examples = 'examples';
const relativeImport = /(\bfrom ')(\.\.?\/[^']*)(')/g;

export function run(access) {
  const files = access.list(examples, (file) => !file.includes('/node_modules/'));
  const skipped = convertCommonJs(
    files.filter((file) => file.endsWith('.js')),
    access,
    {
      // The models import each other, which works in their relation mappings,
      // as these are only read once all modules are loaded.
      hoistsAllRequires: true,
      defaultAtDeclaration: true,
      defaultObjects: true,
      importMeta: true,
    },
  );
  for (const file of files.filter((file) => file.endsWith('.ts'))) {
    const source = access.read(file);
    const fixed = source.replace(relativeImport, (match, before, specifier, after) =>
      path.posix.extname(specifier) ? match : `${before}${specifier}.js${after}`,
    );
    if (fixed !== source) {
      access.write(file, fixed);
    }
  }
  for (const file of files.filter((file) => path.posix.basename(file) === 'package.json')) {
    const source = access.read(file);
    const json = new JsonEditor(source).set(['type'], 'module', { after: 'description' });
    if (json.get(['engines', 'node'])) {
      json.set(['engines', 'node'], node);
    } else {
      json.set(['engines'], { node }, { after: 'scripts' });
    }
    const edited = json.toString();
    if (edited !== source) {
      access.write(file, edited);
    }
  }
  return skipped;
}
