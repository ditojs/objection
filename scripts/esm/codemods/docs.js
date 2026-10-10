// Converts the JavaScript examples in the docs and in the READMEs of the example
// projects to ES modules, with the engine in commonJs.js. The examples are fragments of code, so the modules they import
// are taken for `.js` files with a default export. Examples that don't parse as
// a whole, e.g. because they declare a name twice, get their requires converted
// line by line.
//
// `static relationMappings = { … }` becomes a getter, as the class field is
// evaluated when the class is defined, before the related models' modules are
// evaluated if they import each other.
//
// This runs before config.js makes the package an ES module.

import path from 'node:path';
import MagicString from 'magic-string';
import { parseScript, walk } from '../lib/ast.js';
import { convertCommonJs } from './commonJs.js';

export const description = 'code examples in the docs to ES modules';

const fence = /^(```js\n)([\s\S]*?)(^```$)/gm;
const commonJs = /\brequire\(|\bmodule\.exports\b|^exports\.|\b__dirname\b/m;
// `...` on a line of its own, which stands for left out code.
const ellipsis = /^(\s*)\.\.\.$/gm;
const placeholder = /^(\s*);;;$/gm;

const options = {
  packageName: 'objection',
  inlineRequires: true,
  importMeta: true,
  hoistsAllRequires: true,
  assumesFiles: true,
  packageImportNames: { knex: 'Knex' },
};

export function run(access) {
  // Once the package is an ES module, the CommonJS left in the docs is meant to
  // be there, e.g. to show how CommonJS code loads objection.
  if (JSON.parse(access.read('package.json')).type === 'module') {
    return [];
  }
  const files = [
    ...access.list('doc', (file) => file.endsWith('.md')),
    ...access.list('examples', (file) => /^examples\/[^/]+\/README\.md$/.test(file)),
  ];
  for (const file of files) {
    const source = access.read(file);
    const converted = source.replace(
      fence,
      (block, start, code, end) => `${start}${convertExample(code, file)}${end}`,
    );
    if (converted !== source) {
      access.write(file, converted);
    }
  }
  return [];
}

function convertExample(code, file) {
  // The same number of characters, but code that parses: an empty class
  // element or empty statements.
  let converted = code.replace(ellipsis, '$1;;;');
  if (commonJs.test(code)) {
    converted = parses(converted)
      ? convertModule(converted, file)
      : converted
          .split('\n')
          .map((line) => (commonJs.test(line) && parses(line) ? convertModule(line, file) : line))
          .join('\n');
  }
  if (parses(converted)) {
    converted = relationMappingsGetters(converted);
  }
  return converted.replace(placeholder, '$1...');
}

// Converts code with the engine, as a module next to the Markdown file.
function convertModule(code, file) {
  const example = path.posix.join(path.posix.dirname(file), 'example.js');
  let converted = code;
  const access = {
    read: () => converted,
    write: (_, content) => {
      converted = content;
    },
    exists: (file) => file === example,
  };
  // Like the example projects, their READMEs export classes at their declarations.
  const defaultAtDeclaration = file.startsWith('examples/');
  convertCommonJs([example], access, { ...options, defaultAtDeclaration });
  return converted;
}

function parses(code) {
  try {
    parseScript(code);
    return true;
  } catch {
    return false;
  }
}

// `static relationMappings = { … };` -> `static get relationMappings() { return { … }; }`
function relationMappingsGetters(code) {
  const result = new MagicString(code);
  walk(parseScript(code), (node) => {
    if (
      node.type === 'PropertyDefinition' &&
      node.static &&
      node.key.name === 'relationMappings' &&
      node.value?.type === 'ObjectExpression'
    ) {
      const indent = code.slice(code.lastIndexOf('\n', node.start) + 1, node.start);
      const object = code.slice(node.value.start, node.value.end).replaceAll('\n', '\n  ');
      result.overwrite(
        node.start,
        node.end,
        `static get relationMappings() {\n${indent}  return ${object};\n${indent}}`,
      );
    }
  });
  return result.toString();
}
