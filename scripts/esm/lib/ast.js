import * as acorn from 'acorn';

export function parseScript(source) {
  return acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
}

export function parseModule(source, { onComment } = {}) {
  return acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    onComment,
  });
}

// Calls `visit(node, parents)` for every node of the tree, depth first. `parents`
// lists the ancestors of `node`, the closest one last.
export function walk(node, visit, parents = []) {
  visit(node, parents);
  parents.push(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child.type === 'string') {
        walk(child, visit, parents);
      }
    }
  }
  parents.pop();
}

// The string value of a string literal, or of a template literal without
// expressions.
export function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

// The specifier of a `require('specifier')` call, or null.
export function requireSpecifier(node) {
  return node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments.length === 1
    ? staticString(node.arguments[0])
    : null;
}

export function isModuleExports(node) {
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === 'module' &&
    node.property.name === 'exports'
  );
}

export function isIdentifier(node, name) {
  return node?.type === 'Identifier' && (name === undefined || node.name === name);
}

// Whether `node` is an identifier that refers to a binding, as opposed to a
// property name, an object key or a label.
export function isReference(node, parent) {
  if (node.type !== 'Identifier' || !parent) {
    return node.type === 'Identifier';
  }
  switch (parent.type) {
    case 'MemberExpression':
      return parent.object === node || parent.computed;
    case 'Property':
      // A shorthand property is both a key and a reference.
      return parent.value === node || parent.computed;
    case 'MethodDefinition':
    case 'PropertyDefinition':
      return parent.computed && parent.key === node;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return false;
    case 'ExportSpecifier':
      return parent.local === node;
    default:
      return true;
  }
}

// The names of the identifiers bound by a declaration pattern.
export function patternNames(pattern, names = []) {
  switch (pattern?.type) {
    case 'Identifier':
      names.push(pattern.name);
      break;
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        patternNames(property.type === 'RestElement' ? property.argument : property.value, names);
      }
      break;
    case 'ArrayPattern':
      pattern.elements.forEach((element) => patternNames(element, names));
      break;
    case 'RestElement':
      patternNames(pattern.argument, names);
      break;
    case 'AssignmentPattern':
      patternNames(pattern.left, names);
      break;
  }
  return names;
}

// The names declared at the top level of a program, mapped to their declaration
// statements.
export function topLevelDeclarations(program) {
  const declarations = new Map();
  for (const statement of program.body) {
    if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
      declarations.set(statement.id.name, statement);
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        for (const name of patternNames(declarator.id)) {
          declarations.set(name, statement);
        }
      }
    }
  }
  return declarations;
}

// Whether `export` can be put in front of a declaration statement without
// changing what it declares.
export function isExportableDeclaration(statement) {
  if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
    return true;
  }
  return (
    statement.type === 'VariableDeclaration' &&
    statement.kind !== 'var' &&
    statement.declarations.length === 1 &&
    statement.declarations[0].id.type === 'Identifier'
  );
}

// Counts the references to each name in the tree, ignoring the given nodes and
// everything inside them.
export function countReferences(program, ignoredNodes = []) {
  const ignored = new Set(ignoredNodes);
  const counts = new Map();
  (function visit(node, parent) {
    if (ignored.has(node)) {
      return;
    }
    if (node.type === 'Identifier' && isReference(node, parent)) {
      counts.set(node.name, (counts.get(node.name) ?? 0) + 1);
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof child.type === 'string') {
          visit(child, node);
        }
      }
    }
  })(program, null);
  return counts;
}
