// Replaces what the tests use of mocha's `this` context, which vitest doesn't
// have, and turns the test functions that no longer need `this` into arrow
// functions:
//
//   it('…', async function () {       // Why it's skipped.
//     if (condition) {                it.skipIf(condition)('…', async () => {
//       // Why it's skipped.            …
//       return this.skip();          });
//     }
//     …
//   });
//
// `this.timeout(ms)` at the start of a test or hook becomes its timeout argument.

import MagicString from 'magic-string';
import { isIdentifier, parseModule, walk } from '../lib/ast.js';
import { testFiles } from './tests.js';

export const description = "mocha's test context to vitest";

const testFunctions = new Set([
  'describe',
  'it',
  'before',
  'after',
  'beforeAll',
  'afterAll',
  'beforeEach',
  'afterEach',
]);

export function run(access) {
  for (const file of testFiles(access)) {
    const source = access.read(file);
    const code = convertContext(source);
    if (code !== source) {
      access.write(file, code);
    }
  }
  return [];
}

function convertContext(source) {
  const comments = [];
  const program = parseModule(source, { onComment: comments });
  const code = new MagicString(source);
  walk(program, (node) => {
    if (isOnlyBinding(node)) {
      // `it.only.bind(it)` -> `it.only`
      code.remove(node.callee.object.end, node.end);
    }
    const callback = node.type === 'CallExpression' && testCallback(node);
    if (!callback) {
      return;
    }
    const removed = [];
    let [first] = callback.body.body;
    const timeout = contextCall(first, 'timeout');
    if (timeout?.arguments.length === 1) {
      const [ms] = timeout.arguments;
      code.appendLeft(callback.end, `, ${source.slice(ms.start, ms.end)}`);
      removeStatement(code, source, first);
      removed.push(first);
      first = callback.body.body[1];
    }
    const condition = node.callee.name === 'it' && skipCondition(first);
    if (condition) {
      code.appendLeft(node.callee.end, `.skipIf(${source.slice(condition.start, condition.end)})`);
      const indent = source.slice(lineStart(source, node.start), node.start);
      for (const comment of comments.filter((it) => isInside(it, first))) {
        code.appendLeft(node.start, `${source.slice(comment.start, comment.end)}\n${indent}`);
      }
      removeStatement(code, source, first);
      removed.push(first);
    }
    if (!usesContext(callback.body, removed)) {
      toArrowFunction(code, source, callback);
    }
  });
  return code.toString();
}

// The `function () { … }` callback of a test, suite or hook.
function testCallback(call) {
  if (!isIdentifier(call.callee) || !testFunctions.has(call.callee.name)) {
    return null;
  }
  const callback = call.arguments.at(-1);
  return callback?.type === 'FunctionExpression' && !callback.generator ? callback : null;
}

// `this.name(…)` as an expression statement, with or without `return`.
function contextCall(statement, name) {
  const expression =
    statement?.type === 'ReturnStatement' ? statement.argument : statement?.expression;
  const isCall =
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.object.type === 'ThisExpression' &&
    expression.callee.property.name === name;
  return isCall ? expression : null;
}

// The condition of `if (condition) { return this.skip(); }`, or null.
function skipCondition(statement) {
  if (statement?.type !== 'IfStatement' || statement.alternate) {
    return null;
  }
  const { consequent } = statement;
  const body = consequent.type === 'BlockStatement' ? consequent.body : [consequent];
  return body.length === 1 && contextCall(body[0], 'skip') ? statement.test : null;
}

// Whether a function body uses `this` or `arguments` outside the removed
// statements, which an arrow function would change.
function usesContext(body, removed) {
  let uses = false;
  walk(body, (node, parents) => {
    const isOwn = !parents.some((parent) => /^Function/.test(parent.type));
    const isContext = node.type === 'ThisExpression' || isIdentifier(node, 'arguments');
    if (isContext && isOwn && !removed.some((statement) => isInside(node, statement))) {
      uses = true;
    }
  });
  return uses;
}

// `async function (a) { … }` -> `async (a) => { … }`
function toArrowFunction(code, source, fn) {
  const keyword = source.indexOf('function', fn.start);
  const paramsStart = source.indexOf('(', keyword);
  const paramsEnd = source.lastIndexOf(')', fn.body.start) + 1;
  code.overwrite(keyword, fn.body.start, `${source.slice(paramsStart, paramsEnd)} => `);
}

function isOnlyBinding(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === 'bind' &&
    node.callee.object.type === 'MemberExpression' &&
    isIdentifier(node.callee.object.object, 'it') &&
    node.callee.object.property.name === 'only' &&
    node.arguments.length === 1 &&
    isIdentifier(node.arguments[0], 'it')
  );
}

function isInside(node, container) {
  return node.start >= container.start && node.end <= container.end;
}

// Removes a statement with its line, and the blank line after it.
function removeStatement(code, source, statement) {
  let end = statement.end;
  while (source[end] === '\n' && end < statement.end + 2) {
    end++;
  }
  code.remove(lineStart(source, statement.start), end);
}

function lineStart(source, index) {
  while (index > 0 && /[ \t]/.test(source[index - 1])) {
    index--;
  }
  return index;
}
