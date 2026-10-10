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
  // The removed statements, as the walk visits the suites before their hooks.
  const removed = [];
  walk(program, (node) => {
    if (isOnlyBinding(node)) {
      // `it.only.bind(it)` -> `it.only`
      code.remove(node.callee.object.end, node.end);
    }
    const suite = node.type === 'CallExpression' && suiteCallback(node);
    if (suite) {
      removed.push(...convertSkippingHooks(code, source, comments, node, suite));
    }
    const callback = node.type === 'CallExpression' && testCallback(node);
    if (!callback) {
      return;
    }
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
      skipIf(code, source, comments, node, condition, first);
      removed.push(first);
    }
    if (!usesContext(callback.body, removed)) {
      toArrowFunction(code, source, callback);
    } else if (node.callee.name === 'it' && callback.params.length === 0) {
      convertSkipCalls(code, source, callback, removed);
    }
  });
  return code.toString();
}

// `it(…)` / `describe(…)` -> `it.skipIf(condition)(…)` / `describe.skipIf(…)(…)`,
// with the comments of the removed `if` statement in front of it.
function skipIf(code, source, comments, call, condition, statement) {
  code.appendLeft(call.callee.end, `.skipIf(${source.slice(condition.start, condition.end)})`);
  const indent = source.slice(lineStart(source, call.start), call.start);
  for (const comment of comments.filter((it) => isInside(it, statement))) {
    code.appendLeft(call.start, `${source.slice(comment.start, comment.end)}\n${indent}`);
  }
  removeStatement(code, source, statement);
}

// A `before()` hook of a suite that starts with `if (condition) {
// this.skip(); }` skips the whole suite:
//
//   describe('…', () => {            describe.skipIf(condition)('…', () => {
//     before(async function () {       before(async () => {
//       if (condition) {                 …
//         this.skip();                 });
//       }                            });
//       …
//     });
//   });
//
// The condition has to be available outside the suite, so it can't use what the
// suite's callback declares. Returns the removed statements.
function convertSkippingHooks(code, source, comments, suite, callback) {
  const declared = declaredNames(callback.body);
  for (const statement of callback.body.body) {
    const hook = statement.type === 'ExpressionStatement' && statement.expression;
    const isHook =
      hook?.type === 'CallExpression' &&
      (isIdentifier(hook.callee, 'before') || isIdentifier(hook.callee, 'beforeAll'));
    const hookCallback = isHook ? testCallback(hook) : null;
    const first = hookCallback?.body.body[0];
    const condition = first && skipCondition(first);
    if (condition && !usesNames(condition, declared)) {
      skipIf(code, source, comments, suite, condition, first);
      return [first];
    }
  }
  return [];
}

// `this.skip()` elsewhere in a test -> `skip()` of vitest's test context, if the
// test uses `this` for nothing else:
//
//   it('…', async function () {      it('…', async ({ skip }) => {
//     if (await condition()) {         if (await condition()) {
//       this.skip();                     skip();
//     }                                }
//   });                              });
function convertSkipCalls(code, source, callback, removed) {
  const calls = [];
  let other = false;
  walk(callback.body, (node, parents) => {
    const isOwn = !parents.some((parent) => /^Function/.test(parent.type));
    if (!isOwn || removed.some((statement) => isInside(node, statement))) {
      return;
    }
    if (node.type === 'ThisExpression') {
      const member = parents.at(-1);
      const call = parents.at(-2);
      const isSkip =
        member?.type === 'MemberExpression' &&
        member.property.name === 'skip' &&
        call?.type === 'CallExpression' &&
        call.callee === member &&
        call.arguments.length === 0;
      if (isSkip) {
        calls.push(member);
      } else {
        other = true;
      }
    } else if (isIdentifier(node, 'arguments')) {
      other = true;
    }
  });
  if (other || calls.length === 0) {
    return;
  }
  for (const member of calls) {
    code.overwrite(member.start, member.end, 'skip');
  }
  const keyword = source.indexOf('function', callback.start);
  code.overwrite(keyword, callback.body.start, '({ skip }) => ');
}

// The names that the top level of a block declares.
function declaredNames(block) {
  const names = new Set();
  for (const statement of block.body) {
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        walk(declarator.id, (node) => {
          if (node.type === 'Identifier') {
            names.add(node.name);
          }
        });
      }
    } else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
      names.add(statement.id.name);
    }
  }
  return names;
}

function usesNames(node, names) {
  let uses = false;
  walk(node, (child) => {
    if (child.type === 'Identifier' && names.has(child.name)) {
      uses = true;
    }
  });
  return uses;
}

// The `function () { … }` callback of a test, suite or hook.
function testCallback(call) {
  if (!isIdentifier(call.callee) || !testFunctions.has(call.callee.name)) {
    return null;
  }
  const callback = call.arguments.at(-1);
  return callback?.type === 'FunctionExpression' && !callback.generator ? callback : null;
}

// The `() => { … }` or `function () { … }` callback of `describe()`.
function suiteCallback(call) {
  if (!isIdentifier(call.callee, 'describe')) {
    return null;
  }
  const callback = call.arguments.at(-1);
  return /Function/.test(callback?.type) && callback.body.type === 'BlockStatement'
    ? callback
    : null;
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
