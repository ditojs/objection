// Formats the files that the codemods changed with the repository's prettier
// configuration, as the target is formatted with it.

import * as prettier from 'prettier';

export const description = 'format the changed files with prettier';

const formattable = /\.(js|mjs|cjs|ts)$/;

export async function run(access) {
  for (const file of access.changed()) {
    if (formattable.test(file) && access.exists(file)) {
      const path = access.resolve(file);
      const config = await prettier.resolveConfig(path);
      const source = access.read(file);
      const formatted = await prettier.format(source, { ...config, filepath: path });
      if (formatted !== source) {
        access.write(file, formatted);
      }
    }
  }
  return [];
}
