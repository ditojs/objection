import { describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tests = await Promise.all(
  fs
    .readdirSync(import.meta.dirname)
    .filter((file) => file.endsWith('.js'))
    .filter((file) => file !== 'index.js')
    .sort()
    .map(
      async (file) => (await import(pathToFileURL(path.join(import.meta.dirname, file)))).default,
    ),
);

export default (session) => {
  describe('misc', () => {
    tests.forEach((test) => test(session));
  });
};
