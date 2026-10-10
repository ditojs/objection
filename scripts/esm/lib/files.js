import fs from 'node:fs';
import path from 'node:path';

// Lists the files below `dir` (relative to `root`) as sorted, root-relative
// POSIX paths, optionally filtered by `filter(file)`.
export function listFiles(root, dir, filter = () => true) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  return fs
    .readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => toPosix(path.relative(root, path.join(entry.parentPath, entry.name))))
    .filter(filter)
    .sort();
}

export function toPosix(file) {
  return file.split(path.sep).join('/');
}

// Reads and writes files by root-relative path, and keeps track of the files
// it writes.
export function createFileAccess(root) {
  const resolve = (file) => path.join(root, file);
  const changed = new Set();
  return {
    root,
    resolve,
    exists: (file) => fs.existsSync(resolve(file)),
    read: (file) => fs.readFileSync(resolve(file), 'utf8'),
    write(file, content) {
      fs.mkdirSync(path.dirname(resolve(file)), { recursive: true });
      fs.writeFileSync(resolve(file), content);
      changed.add(file);
    },
    remove: (file) => fs.rmSync(resolve(file), { recursive: true, force: true }),
    rename(from, to) {
      fs.mkdirSync(path.dirname(resolve(to)), { recursive: true });
      fs.renameSync(resolve(from), resolve(to));
      changed.delete(from);
      changed.add(to);
    },
    list: (dir, filter) => listFiles(root, dir, filter),
    changed: () => [...changed].sort(),
  };
}
