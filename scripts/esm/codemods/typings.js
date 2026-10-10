// Converts the typings from a namespace exported with `export =` to an ES
// module: the declarations of `declare namespace Objection { … }` move to the
// top level, all with `export`.

import { fixTypeScriptImports } from './typeScriptImports.js';

export const description = 'typings to an ES module';

const file = 'typings/objection/index.d.ts';
const namespaceStart = 'declare namespace Objection {\n';
const namespaceEnd = '\n}\n';
const exportAssignment = /\/\/ Export the entire Objection namespace\.\nexport = Objection;\n/;
const declaration =
  /^(?:declare )?(?:const|let|function|class|interface|type|enum|namespace|abstract class) /;

export function run(access) {
  let source = access.read(file);
  const start = source.indexOf(namespaceStart);
  const end = source.lastIndexOf(namespaceEnd);
  // Converted already.
  if (start === -1 || end < start) {
    return [];
  }
  const body = source.slice(start + namespaceStart.length, end + 1);
  source =
    source.slice(0, start) + exportDeclarations(body) + source.slice(end + namespaceEnd.length);
  source = source.replace(
    exportAssignment,
    '// Only the declarations marked with `export` are exported.\nexport {};\n',
  );
  access.write(file, fixTypeScriptImports(file, source, access));
  return [];
}

// Dedents the namespace's body and exports its top-level declarations, which
// were exported from the namespace implicitly.
function exportDeclarations(body) {
  return body
    .split('\n')
    .map((line) => {
      if (!line.startsWith('  ')) {
        return line;
      }
      const dedented = line.slice(2);
      return declaration.test(dedented) ? `export ${dedented}` : dedented;
    })
    .join('\n');
}
