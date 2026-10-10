// Edits JSON files in place, so that everything the edits don't touch keeps its
// formatting.

import { isDeepStrictEqual } from 'node:util';
import * as acorn from 'acorn';
import MagicString from 'magic-string';

export class JsonEditor {
  constructor(source) {
    this.source = source;
    this.code = new MagicString(source);
    // As an expression, the JSON gets positions for its values.
    this.root = acorn.parseExpressionAt(source, 0, { ecmaVersion: 'latest' });
  }

  // Sets the value at `path`. A new property is added after the property
  // `after`, or as the last one.
  set(path, value, { after } = {}) {
    const object = this.lookup(path.slice(0, -1));
    const key = path.at(-1);
    const property = findProperty(object, key);
    if (property) {
      if (!isDeepStrictEqual(evaluate(property.value), value)) {
        const indent = this.indentOf(property);
        this.code.overwrite(property.value.start, property.value.end, formatJson(value, indent));
      }
      return this;
    }
    const previous = (after && findProperty(object, after)) ?? object.properties.at(-1);
    if (!previous) {
      throw new Error(`Can't add ${path.join('.')} to an empty object`);
    }
    const indent = this.indentOf(previous);
    this.code.appendLeft(
      previous.end,
      `,\n${indent}${JSON.stringify(key)}: ${formatJson(value, indent)}`,
    );
    return this;
  }

  // Removes the property at `path`, if it exists.
  remove(path) {
    const object = this.lookup(path.slice(0, -1));
    const property = findProperty(object, path.at(-1));
    if (property) {
      const index = object.properties.indexOf(property);
      const previous = object.properties[index - 1];
      const next = object.properties[index + 1];
      if (next) {
        this.code.remove(property.start, next.start);
      } else if (previous) {
        this.code.remove(previous.end, property.end);
      } else {
        this.code.remove(object.start + 1, object.end - 1);
      }
    }
    return this;
  }

  // The value at `path`, as it is in the source, or undefined.
  get(path) {
    let node = this.root;
    for (const key of path) {
      node = node.type === 'ObjectExpression' ? findProperty(node, key)?.value : null;
      if (!node) {
        return undefined;
      }
    }
    return evaluate(node);
  }

  toString() {
    return this.code.toString();
  }

  lookup(path) {
    let node = this.root;
    for (const key of path) {
      node = findProperty(node, key)?.value;
      if (node?.type !== 'ObjectExpression') {
        throw new Error(`${path.join('.')} is no object`);
      }
    }
    return node;
  }

  indentOf(property) {
    const lineStart = this.source.lastIndexOf('\n', property.start) + 1;
    return this.source.slice(lineStart, property.start);
  }
}

function findProperty(object, key) {
  return object?.properties.find((property) => property.key.value === key) ?? null;
}

// The value of a JSON node.
function evaluate(node) {
  switch (node.type) {
    case 'ObjectExpression':
      return Object.fromEntries(
        node.properties.map((property) => [property.key.value, evaluate(property.value)]),
      );
    case 'ArrayExpression':
      return node.elements.map(evaluate);
    case 'UnaryExpression':
      return -evaluate(node.argument);
    default:
      return node.value;
  }
}

// Formats a value for a property at `indent`: objects with a property per line,
// arrays of primitive values on one line.
export function formatJson(value, indent = '') {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    const items = value.map((item) => `${inner}${formatJson(item, inner)}`);
    return value.length ? `[\n${items.join(',\n')}\n${indent}]` : '[]';
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJson(item, inner)}`,
    );
    return entries.length ? `{\n${entries.join(',\n')}\n${indent}}` : '{}';
  }
  return JSON.stringify(value);
}
