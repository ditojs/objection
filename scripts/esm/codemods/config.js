// Configures the package as ES modules tested with vitest: edits package.json,
// tsconfig.json and the eslint configuration, and adds the files in templates/,
// e.g. vitest.config.js, unless they exist.

import path from 'node:path';
import { createFileAccess } from '../lib/files.js';
import { JsonEditor } from '../lib/json.js';

export const description = 'package.json, tsconfig.json, eslint and vitest configuration';

const templates = createFileAccess(path.join(import.meta.dirname, '../templates'));

// The engines that can `require()` ES modules without a flag.
export const node = '^20.19.0 || >=22.12.0';

export function run(access) {
  editJson(access, 'package.json', (json) =>
    json
      .set(['type'], 'module', { after: 'description' })
      .set(
        ['exports'],
        {
          '.': {
            types: './typings/objection/index.d.ts',
            default: './lib/objection.js',
          },
          './package.json': './package.json',
        },
        { after: 'main' },
      )
      .set(['scripts', 'test'], 'npm run eslint && vitest run && npm run test:typings')
      .set(['scripts', 'test:fast'], 'vitest run --bail 1')
      .set(['scripts', 'test:watch'], 'vitest', { after: 'test:fast' })
      .set(['engines', 'node'], node)
      .remove(['devDependencies', 'chai'])
      .remove(['devDependencies', 'chai-subset'])
      .remove(['devDependencies', 'expect.js'])
      .remove(['devDependencies', 'mocha'])
      .set(['devDependencies', 'vitest'], '^4.1.11'),
  );
  editJson(access, 'tsconfig.json', (json) =>
    json
      .set(['compilerOptions', 'module'], 'nodenext')
      .set(['compilerOptions', 'moduleResolution'], 'nodenext')
      .remove(['compilerOptions', 'noImplicitUseStrict'])
      .set(['compilerOptions', 'target'], 'es2022')
      .set(['compilerOptions', 'types'], ['node'], { after: 'target' }),
  );
  editJson(access, '.eslintrc.json', (json) =>
    json
      .set(['parserOptions', 'sourceType'], 'module', { after: 'ecmaVersion' })
      .remove(['env', 'mocha'])
      .set(
        ['overrides'],
        [
          {
            // The model files that the relation tests load by path.
            files: ['tests/unit/relations/files/*.js'],
            parserOptions: { sourceType: 'script' },
          },
        ],
      ),
  );
  for (const file of templates.list('.')) {
    if (!access.exists(file)) {
      access.write(file, templates.read(file));
    }
  }
  return [];
}

function editJson(access, file, edit) {
  const source = access.read(file);
  const edited = edit(new JsonEditor(source)).toString();
  if (edited !== source) {
    access.write(file, edited);
  }
}
