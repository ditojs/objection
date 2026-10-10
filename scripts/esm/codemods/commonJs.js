// The engine behind the CommonJS to ES module codemods: converts `require()`
// calls to imports and `module.exports` to exports, putting the exports at the
// declarations where possible.

import { builtinModules } from 'node:module';
import path from 'node:path';
import MagicString from 'magic-string';
import {
  countReferences,
  isExportableDeclaration,
  isIdentifier,
  isModuleExports,
  isReference,
  parseModule,
  parseScript,
  requireSpecifier,
  topLevelDeclarations,
  walk,
} from '../lib/ast.js';

const builtins = new Set(builtinModules);

/**
 * Converts the CommonJS `files` (root-relative paths) to ES modules in place.
 *
 * Options:
 * - `singleExport`: how `module.exports = value` is exported: as `'default'`
 *   export, or as `'named'` export, named by `exportName()` or after the value.
 * - `defaultAtDeclaration`: whether the default export of a declared class or
 *   function goes to its declaration.
 * - `defaultObjects`: whether `module.exports = { … }` with values other than
 *   local names is a default export, e.g. a configuration object, rather than
 *   an object of exports.
 * - `exportName(file)`: the name to export a module's value by as a whole, even
 *   an object, or null to export an object's properties.
 * - `inlineRequires`: whether to convert the `require()` calls of local modules
 *   that aren't assigned to a variable, e.g. `require('./find')(session)`.
 * - `inlineImportName(file)`: the local name for such a require's default
 *   import.
 * - `packageName`: the name to import the package root by.
 * - `importMeta`: whether to replace `__dirname` and `__filename`.
 * - `commonJsPackages`: the packages that ES modules can only import as a
 *   whole, as node can't detect their named exports. Their destructuring
 *   requires become a default import and a destructuring declaration.
 * - `packageImportNames`: the local names for inline requires of packages, by
 *   package. The others are named after the specifier's last part.
 * - `keepsRequire(file)`: whether the inline requires of a local file stay
 *   `require()` calls.
 * - `hoistsAllRequires`: whether all requires inside functions become imports,
 *   e.g. the ones that avoid require loops, not only destructuring ones.
 * - `assumesFiles`: whether local modules that don't exist are taken for
 *   `.js` files with a default export, e.g. in code examples.
 *
 * `exports.x = …` at the top level becomes `export function x` or
 * `export const x`.
 *
 * Returns what it couldn't convert: `require()` calls and `exports.x` in other
 * places.
 */
export function convertCommonJs(files, access, options = {}) {
  const context = {
    access,
    singleExport: 'default',
    exportName: () => null,
    inlineRequires: false,
    inlineImportName: defaultInlineImportName,
    packageName: null,
    importMeta: false,
    commonJsPackages: [],
    packageImportNames: {},
    keepsRequire: () => false,
    defaultAtDeclaration: false,
    defaultObjects: false,
    hoistsAllRequires: false,
    assumesFiles: false,
    ...options,
  };
  context.shapes = new ModuleShapes(context);
  // Look up what the modules export before any of them is converted.
  files.forEach((file) => context.shapes.get(file));
  const skipped = [];
  for (const file of files) {
    const source = access.read(file);
    if (isEsModule(source)) {
      continue;
    }
    const result = new ModuleConverter(file, splitRequireDeclarations(source), context).convert();
    skipped.push(...result.skipped.map((message) => `${file}: ${message}`));
    if (result.code !== source) {
      access.write(file, result.code);
    }
  }
  return skipped;
}

class ModuleConverter {
  constructor(file, source, context) {
    this.file = file;
    this.source = source;
    this.context = context;
    this.program = parseScript(source);
    this.code = new MagicString(source);
    this.declarations = topLevelDeclarations(this.program);
    this.requires = this.program.body.map(parseRequire).filter(Boolean);
    this.exportsStatement = this.program.body.find(isModuleExportsStatement) ?? null;
    this.hoisted = [];
    this.destructured = [];
    this.skipped = [];
  }

  convert() {
    this.convertExportsProperties();
    this.removeUseStrict();
    const reexported = this.findReexports();
    this.convertRequires(reexported);
    this.hoistNestedRequires();
    if (this.context.inlineRequires) {
      this.hoistInlineRequires();
    }
    this.writeHoistedImports();
    if (this.exportsStatement) {
      this.convertExports(reexported);
    }
    if (this.context.importMeta) {
      this.replaceModuleGlobals();
    }
    return { code: this.code.toString(), skipped: this.skipped };
  }

  removeUseStrict() {
    const [first] = this.program.body;
    if (first?.directive === 'use strict') {
      let end = first.end;
      while (this.source[end] === '\n') {
        end++;
      }
      this.code.remove(first.start, end);
    }
  }

  // The local names of the imported bindings that the module only re-exports,
  // under the same name. These become `export … from` declarations. If the
  // module renames some imports in its exports, they all stay in one list.
  findReexports() {
    const reexported = new Set();
    const exported = this.exportsStatement?.expression.right;
    if (exported?.type !== 'ObjectExpression') {
      return reexported;
    }
    const imported = new Set(
      this.requires.flatMap((entry) => this.bindingNames(entry).map((names) => names?.[1])),
    );
    const references = countReferences(this.program, [
      this.exportsStatement,
      ...this.requires.map(({ statement }) => statement),
    ]);
    for (const property of exported.properties) {
      const names = propertyNames(property);
      if (names && imported.has(names[1])) {
        if (names[0] !== names[1]) {
          return new Set();
        }
        if (!references.has(names[1])) {
          reexported.add(names[1]);
        }
      }
    }
    return reexported;
  }

  // Replaces the top-level requires. In modules that re-export, the imports are
  // grouped above the re-exports when the requires form one block.
  convertRequires(reexported) {
    const converted = this.requires.map((entry) => {
      const names = this.bindingNames(entry);
      const isReexport = (pair) => pair && pair[0] !== '*' && reexported.has(pair[1]);
      const imports = names.filter((pair) => !isReexport(pair));
      const reexports = names.filter(isReexport);
      return {
        statement: entry.statement,
        importText: imports.length ? this.importText(entry, imports) : null,
        reexportText: reexports.length
          ? `export { ${specifierList(reexports)} } from '${this.resolve(entry.specifier)}';`
          : null,
      };
    });
    const isBlock = converted.every(
      ({ statement }, index) =>
        index === 0 ||
        this.source.slice(converted[index - 1].statement.end, statement.start).trim() === '',
    );
    const imports = converted.flatMap(({ importText }) => importText ?? []);
    const reexports = converted.flatMap(({ reexportText }) => reexportText ?? []);
    if (imports.length && reexports.length && isBlock) {
      this.code.overwrite(
        converted[0].statement.start,
        converted.at(-1).statement.end,
        `${imports.join('\n')}\n\n${reexports.join('\n')}`,
      );
    } else {
      for (const { statement, importText, reexportText } of converted) {
        const text = [importText, reexportText].filter(Boolean).join('\n');
        this.code.overwrite(statement.start, statement.end, text);
      }
    }
  }

  // Destructuring requires inside functions, e.g. to break a require cycle,
  // become imports, or all requires with `hoistsAllRequires`. Lazy requires
  // like `once(() => require('./A').A)` are left alone, as they need a
  // different solution.
  hoistNestedRequires() {
    walk(this.program, (node, parents) => {
      if (parents.length < 2) {
        return;
      }
      const entry = parseRequire(node);
      const isHoisted =
        entry?.pattern.type === 'ObjectPattern' || (entry && this.context.hoistsAllRequires);
      if (isHoisted && !entry.member) {
        const names = this.bindingNames(entry);
        if (names.every(Boolean)) {
          this.hoisted.push(this.importText(entry, names));
          this.removeLine(node);
          this.requires.push({ ...entry, nested: true });
        }
      }
    });
  }

  // `exports.x = …` and `module.exports.x = …` at the top level become exports,
  // the ones in other places are reported.
  convertExportsProperties() {
    const converted = new Set();
    for (const statement of this.program.body) {
      const { expression } = statement;
      const target = expression?.type === 'AssignmentExpression' && expression.left;
      if (isExportsProperty(target) && !target.computed) {
        this.convertExportsProperty(statement, target.property.name, expression.right);
        converted.add(target);
      }
    }
    walk(this.program, (node) => {
      const target = node.type === 'AssignmentExpression' && node.left;
      if (isExportsProperty(target) && !converted.has(target)) {
        this.skipped.push(`unsupported ${this.text(target)} = …`);
      }
    });
  }

  // `exports.up = (knex) => { … };` -> `export function up(knex) { … }`
  convertExportsProperty(statement, name, value) {
    const isFunction = /^(Arrow)?FunctionExpression$/.test(value.type);
    if (!isFunction || value.body.type !== 'BlockStatement' || value.generator || value.id) {
      this.code.overwrite(statement.start, value.start, `export const ${name} = `);
      return;
    }
    const params = value.params.length
      ? this.source.slice(value.params[0].start, value.params.at(-1).end)
      : '';
    const prefix = value.async ? 'async ' : '';
    this.code.overwrite(
      statement.start,
      value.body.start,
      `export ${prefix}function ${name}(${params}) `,
    );
    this.code.remove(value.body.end, statement.end);
  }

  // Other requires of local modules, e.g. `require('./find')(session)`, become
  // imports under a name of their own, unless the module uses that name for
  // something else already.
  hoistInlineRequires() {
    const handled = new Set(this.requires.map(({ call }) => call));
    const used = this.usedNames();
    const imported = new Map();
    walk(this.program, (node) => {
      const specifier = requireSpecifier(node);
      if (specifier === null || handled.has(node)) {
        return;
      }
      const target = this.context.shapes.resolveFile(this.file, specifier);
      if (target && this.context.keepsRequire(target)) {
        return;
      }
      const isPackage = !specifier.startsWith('.') && !specifier.endsWith('.json');
      const assumed = !target && !isPackage && this.assumedFile(specifier);
      const shape =
        isPackage || assumed ? { kind: 'default' } : target && this.context.shapes.get(target);
      const name = isPackage
        ? this.packageImportName(specifier)
        : shape?.kind === 'named'
          ? shape.name
          : (target || assumed) && this.context.inlineImportName(target || assumed);
      const from = name && this.resolve(specifier);
      const isFree = name && (imported.has(name) ? imported.get(name) === from : !used.has(name));
      if (!isFree) {
        const reason = name ? `, as '${name}' is taken` : '';
        this.skipped.push(`${this.source.slice(node.start, node.end)}${reason}`);
        return;
      }
      imported.set(name, from);
      this.hoisted.push(
        shape.kind === 'named'
          ? `import { ${name} } from '${from}';`
          : `import ${name} from '${from}';`,
      );
      this.code.overwrite(node.start, node.end, name);
    });
  }

  // Adds the hoisted imports after the top-level ones, followed by the
  // destructuring declarations of the `commonJsPackages`.
  writeHoistedImports() {
    const last = this.requires.filter(({ nested }) => !nested).at(-1);
    if (this.hoisted.length) {
      const text = [...new Set(this.hoisted)].join('\n');
      if (last) {
        this.code.appendLeft(last.statement.end, `\n${text}`);
      } else {
        this.code.prepend(`${text}\n\n`);
      }
    }
    if (this.destructured.length) {
      this.code.appendLeft(last.statement.end, `\n\n${this.destructured.join('\n')}`);
    }
  }

  convertExports(reexported) {
    const statement = this.exportsStatement;
    const exported = statement.expression.right;
    if (this.context.shapes.get(this.file).kind !== 'object') {
      this.convertSingleExport(statement, exported);
      return;
    }
    const list = [];
    const constants = [];
    for (const property of exported.properties) {
      const names = propertyNames(property);
      if (names) {
        const [name, local] = names;
        const declaration = this.declarations.get(local);
        if (reexported.has(local)) {
          continue;
        } else if (name === local && declaration && isExportableDeclaration(declaration)) {
          this.code.appendLeft(declaration.start, 'export ');
        } else {
          list.push([local, name]);
        }
      } else if (property.type === 'Property' && !property.computed && isIdentifier(property.key)) {
        const value = this.source.slice(property.value.start, property.value.end);
        constants.push(`export const ${property.key.name} = ${value};`);
      } else {
        throw new Error(`${this.file}: unsupported export ${this.text(property)}`);
      }
    }
    const lines = list.length ? [`export { ${specifierList(list)} };`, ...constants] : constants;
    if (lines.length) {
      this.code.overwrite(statement.start, statement.end, lines.join('\n'));
    } else {
      this.removeWithLeadingWhitespace(statement);
    }
  }

  convertSingleExport(statement, exported) {
    const shape = this.context.shapes.get(this.file);
    const declaration = isIdentifier(exported) && this.declarations.get(exported.name);
    const isDeclared = /^(Class|Function)Declaration$/.test(declaration?.type);
    if (shape.kind === 'default' && isDeclared && this.context.defaultAtDeclaration) {
      this.code.appendLeft(declaration.start, 'export default ');
      this.removeWithLeadingWhitespace(statement);
      return;
    }
    if (shape.kind === 'default') {
      this.code.overwrite(statement.start, exported.start, 'export default ');
      // `export default function () {}` is a declaration, without semicolon.
      const isDeclaration = /^(Function|Class)Expression$/.test(exported.type);
      if (isDeclaration && this.source[statement.end - 1] === ';') {
        this.code.remove(statement.end - 1, statement.end);
      }
      return;
    }
    if (declaration && isExportableDeclaration(declaration)) {
      this.code.appendLeft(declaration.start, 'export ');
      this.removeWithLeadingWhitespace(statement);
    } else {
      this.code.overwrite(statement.start, exported.start, `export const ${shape.name} = `);
    }
  }

  replaceModuleGlobals() {
    const replacements = new Map([
      ['__dirname', 'import.meta.dirname'],
      ['__filename', 'import.meta.filename'],
    ]);
    walk(this.program, (node, parents) => {
      if (isIdentifier(node) && replacements.has(node.name) && isReference(node, parents.at(-1))) {
        this.code.overwrite(node.start, node.end, replacements.get(node.name));
      }
    });
  }

  importText(entry, names) {
    const from = this.resolve(entry.specifier);
    if (names[0][0] !== '*' && this.context.commonJsPackages.includes(entry.specifier)) {
      const local = this.packageImportName(entry.specifier, { inline: false });
      const bindings = names.map(([imported, name]) =>
        imported === name ? name : `${imported}: ${name}`,
      );
      this.destructured.push(`const { ${bindings.join(', ')} } = ${local};`);
      return `import ${local} from '${from}';`;
    }
    if (names[0][0] !== '*') {
      // Keep the lines of a destructuring pattern that spans several.
      const { pattern } = entry;
      const isMultiline = this.text(pattern).includes('\n');
      const isShorthand = names.every(([imported, local]) => imported === local);
      const list = isMultiline && isShorthand ? this.text(pattern) : `{ ${specifierList(names)} }`;
      return `import ${list} from '${from}';`;
    }
    const [[, local]] = names;
    return this.shapeOf(entry.specifier).kind === 'object'
      ? `import * as ${local} from '${from}';`
      : `import ${local} from '${from}';`;
  }

  // The `[imported, local]` pairs of a require, with `'*'` for the whole module
  // unless that has a named single export.
  bindingNames(entry) {
    if (entry.pattern.type === 'ObjectPattern') {
      return entry.pattern.properties.map(propertyNames);
    }
    const shape = this.shapeOf(entry.specifier);
    const imported = entry.member ?? (shape.kind === 'named' ? shape.name : '*');
    return [[imported, entry.pattern.name]];
  }

  // What a required module exports. Packages count as default exports, apart
  // from the package itself.
  shapeOf(specifier) {
    if (this.resolve(specifier) === this.context.packageName) {
      return { kind: 'object' };
    }
    const target = this.context.shapes.resolveFile(this.file, specifier);
    return target ? this.context.shapes.get(target) : { kind: 'default' };
  }

  resolve(specifier) {
    return resolveSpecifier(this.file, specifier, this.context);
  }

  // The file that a local specifier that doesn't exist is taken for, or null.
  assumedFile(specifier) {
    const file = path.posix.join(path.posix.dirname(this.file), specifier);
    return this.context.assumesFiles && !path.posix.extname(file) ? `${file}.js` : null;
  }

  // `knex/lib/query/method-constants` -> `methodConstants`, unless the options
  // name the package's inline requires.
  packageImportName(specifier, { inline = true } = {}) {
    const name = inline ? this.context.packageImportNames[specifier] : null;
    return (
      name ??
      specifier
        .split('/')
        .at(-1)
        .replace(/-(\w)/g, (_, char) => char.toUpperCase())
    );
  }

  text(node) {
    return this.source.slice(node.start, node.end);
  }

  // The names that the module binds or refers to in any scope.
  usedNames() {
    const names = new Set();
    walk(this.program, (node, parents) => {
      if (isIdentifier(node) && isReference(node, parents.at(-1))) {
        names.add(node.name);
      }
    });
    return names;
  }

  removeLine(node) {
    let start = node.start;
    let end = node.end;
    while (start > 0 && /[ \t]/.test(this.source[start - 1])) {
      start--;
    }
    if (this.source[end] === '\n') {
      end++;
    }
    this.code.remove(start, end);
  }

  removeWithLeadingWhitespace(node) {
    let start = node.start;
    while (start > 0 && /\s/.test(this.source[start - 1])) {
      start--;
    }
    this.code.remove(start, node.end);
  }
}

// What the modules export, looked up lazily: `{ kind: 'object' }` for an object
// of exports, `{ kind: 'default' }` or `{ kind: 'named', name }` for a single
// export.
class ModuleShapes {
  constructor(context) {
    this.context = context;
    this.cache = new Map();
  }

  get(file) {
    if (!this.cache.has(file)) {
      this.cache.set(file, this.analyze(file));
    }
    return this.cache.get(file);
  }

  analyze(file) {
    const source = this.context.access.read(file);
    // Modules that are converted already count too.
    if (/^export default /m.test(source)) {
      return { kind: 'default' };
    }
    if (!/^module\.exports = /m.test(source)) {
      return { kind: 'object' };
    }
    const statement = parseScript(source).body.find(isModuleExportsStatement);
    const exported = statement.expression.right;
    if (this.context.singleExport === 'named') {
      const name = this.context.exportName(file) ?? (isIdentifier(exported) && exported.name);
      if (name) {
        return { kind: 'named', name };
      }
    }
    const isObject = exported.type === 'ObjectExpression';
    const isDefaultObject =
      isObject &&
      this.context.defaultObjects &&
      exported.properties.some((property) => !isIdentifier(property.value));
    if (isObject && !isDefaultObject) {
      return { kind: 'object' };
    }
    if (this.context.singleExport === 'default') {
      return { kind: 'default' };
    }
    throw new Error(`${file}: no name for the single export`);
  }

  // The root-relative path of a required local file, or null.
  resolveFile(file, specifier) {
    if (!specifier.startsWith('.')) {
      return null;
    }
    const base = path.posix.join(path.posix.dirname(file), specifier);
    const candidates = [base, `${base}.js`, `${base}/index.js`];
    return (
      candidates.find(
        (candidate) => /\.[cm]?js$/.test(candidate) && this.context.access.exists(candidate),
      ) ?? null
    );
  }
}

// Whether a module is converted already, so that the codemods can run again.
export function isEsModule(source) {
  try {
    parseScript(source);
    return false;
  } catch {
    parseModule(source);
    return true;
  }
}

// Splits the requires off declarations of several variables, e.g.
// `const a = require('a'), b = a.b;` -> `const a = require('a');\n\nconst b = a.b;`,
// so that they can be converted like the others.
function splitRequireDeclarations(source) {
  const program = parseScript(source);
  const code = new MagicString(source);
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration' || statement.declarations.length < 2) {
      continue;
    }
    const { kind, declarations } = statement;
    const count = declarations.findIndex((declarator) => !isRequireDeclarator(declarator));
    const requires = count === -1 ? declarations : declarations.slice(0, count);
    if (!requires.length) {
      continue;
    }
    const text = (node) => source.slice(node.start, node.end);
    const split = requires.map((declarator) => `${kind} ${text(declarator)};`).join('\n');
    const rest = declarations.slice(requires.length);
    code.overwrite(
      statement.start,
      rest.length ? rest[0].start : statement.end,
      rest.length ? `${split}\n\n${kind} ` : split,
    );
  }
  return code.toString();
}

function isRequireDeclarator({ init }) {
  return requireSpecifier(init?.type === 'MemberExpression' ? init.object : init) !== null;
}

// `const pattern = require('specifier')` or `const x = require('specifier').member`
function parseRequire(statement) {
  if (statement.type !== 'VariableDeclaration' || statement.declarations.length !== 1) {
    return null;
  }
  const [{ id: pattern, init }] = statement.declarations;
  let call = init;
  let member = null;
  if (init?.type === 'MemberExpression' && !init.computed) {
    call = init.object;
    member = init.property.name;
  }
  const specifier = requireSpecifier(call);
  if (specifier === null || !/^(Identifier|ObjectPattern)$/.test(pattern.type)) {
    return null;
  }
  return { statement, pattern, call, specifier, member };
}

// `exports.x` or `module.exports.x`
function isExportsProperty(node) {
  return (
    node?.type === 'MemberExpression' &&
    (isIdentifier(node.object, 'exports') || isModuleExports(node.object))
  );
}

function isModuleExportsStatement(statement) {
  return (
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'AssignmentExpression' &&
    isModuleExports(statement.expression.left)
  );
}

// `[imported, local]` for a property `imported: local` or `name`, or null for
// anything else.
function propertyNames(property) {
  return property.type === 'Property' &&
    !property.computed &&
    isIdentifier(property.key) &&
    isIdentifier(property.value)
    ? [property.key.name, property.value.name]
    : null;
}

function specifierList(names) {
  return names
    .map(([imported, local]) => (imported === local ? local : `${imported} as ${local}`))
    .join(', ');
}

// The ES module specifier for a `require()` specifier: local files get their
// extension, built-in modules the `node:` prefix.
function resolveSpecifier(file, specifier, context) {
  if (specifier.startsWith('.')) {
    const isPackageRoot = path.posix.join(path.posix.dirname(file), specifier, '.') === '.';
    if (context.packageName && isPackageRoot) {
      return context.packageName;
    }
    const target = context.shapes.resolveFile(file, specifier);
    // Keep the specifier as written, apart from detours like the './' in
    // './../a' or the '../lib/' in '../lib/a' from lib/a.js.
    const written = withoutDetours(file, specifier);
    if (!target && context.assumesFiles && !path.posix.extname(written)) {
      return `${written}.js`;
    }
    if (!target || target === path.posix.join(path.posix.dirname(file), written)) {
      return written;
    }
    return target.endsWith('/index.js') && !written.endsWith('/index')
      ? `${written.replace(/\/$/, '')}/index.js`
      : `${written}.js`;
  }
  if (builtins.has(specifier) && !specifier.startsWith('node:')) {
    return `node:${specifier}`;
  }
  // Deep imports into packages need the extension, e.g. 'knex/lib/query/joinclause'.
  const isDeep = specifier.split('/').length > (specifier.startsWith('@') ? 2 : 1);
  return isDeep && !path.posix.extname(specifier) ? `${specifier}.js` : specifier;
}

// `specifier` without a redundant './' before '../', and without the detour
// through the repository's root of a specifier that leads back into the
// directory it left.
function withoutDetours(file, specifier) {
  const written = specifier.replace(/^\.\/(?=\.\.\/)/, '');
  const dir = path.posix.dirname(file);
  const ups = written.match(/^(\.\.\/)*/)[0].length / 3;
  if (ups < dir.split('/').length) {
    return written;
  }
  const relative = path.posix.relative(dir, path.posix.join(dir, written));
  return relative.startsWith('../') ? written : `./${relative}`;
}

// The reserved words that files may be named after.
const reservedWords = new Set(['default', 'delete', 'export', 'import', 'new', 'switch']);

// `./find.js` -> `find`, `./crossDb/index.js` -> `crossDb`, `./delete.js` -> `deleteTests`.
function defaultInlineImportName(file) {
  const base = path.posix.basename(file, path.posix.extname(file));
  const name = base === 'index' ? path.posix.basename(path.posix.dirname(file)) : base;
  return reservedWords.has(name) ? `${name}Tests` : name;
}
