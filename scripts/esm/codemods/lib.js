// Converts lib/ from CommonJS to ES modules.

import { convertCommonJs } from './commonJs.js';

export const description = 'lib/ to ES modules';

export function run(access) {
  const files = access.list(
    'lib',
    (file) => file.endsWith('.js') && !file.startsWith('lib/dbErrors/'),
  );
  // It only made eslint parse lib/ as scripts with 'use strict'.
  access.remove('lib/.eslintrc.json');
  return convertCommonJs(files, access);
}
