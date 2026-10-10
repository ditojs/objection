// Converts tests that signal the end with mocha's `done` callback to tests that
// return their promise, as vitest doesn't support `done`:
//
//   it('…', (done) => {          it('…', () => {
//     query()                      return query()
//       .then(() => {                .then(() => {
//         done(new Error('…'));        throw new Error('…');
//       })                           })
//       .catch((err) => {            .catch((err) => {
//         expect(err)…;                expect(err)…;
//         done();                    });
//       })                         });
//       .catch(done);
//   });
//
// `.catch((err) => { done(err); })` at the end of the chain is removed like
// `.catch(done)`. `.then(() => { done(error); }).catch(() => { … })` becomes
// `.then(() => { throw error; }, () => { … })`, so that the catch callback can't
// swallow the error that fails the test.
//
// Only the `done` calls in the callbacks that the promise chain ending the test
// waits for are converted, as returning that chain then waits for them: those of
// `.then()`, `.catch()` and `.finally()`, and the query builder hooks. Tests that
// use `done` in other ways, e.g. in an event handler or a timer, are left for the
// residual patch, as are `.catch()` callbacks that only call `done()`, where
// returning the promise would let failures through, unless the chain only
// checks that the promise rejects, which vitest can assert:
//
//   query()                        return expect(query()).rejects.toThrow();
//     .then(() => {
//       done(new Error('…'));
//     })
//     .catch(() => {
//       done();
//     });

import MagicString from 'magic-string';
import { isIdentifier, isReference, parseModule, walk } from '../lib/ast.js';
import { testFiles } from './tests.js';

export const description = 'done callbacks to returned promises';

// The methods whose callbacks a promise chain waits for: the promise's, and the
// query builder's hooks, whose errors reject the query.
const chainMethods = new Set(['then', 'catch', 'finally', 'runBefore', 'onBuild', 'runAfter']);

export function run(access) {
  const left = [];
  for (const file of testFiles(access)) {
    const source = access.read(file);
    const result = convertDoneCallbacks(source);
    left.push(...result.left.map((line) => `${file}:${line}: done callback`));
    if (result.code !== source) {
      access.write(file, result.code);
    }
  }
  return left;
}

function convertDoneCallbacks(source) {
  const program = parseModule(source);
  const code = new MagicString(source);
  const left = [];
  walk(program, (node) => {
    if (isDoneCallback(node)) {
      const edits = planRejectionEdits(node, source) ?? planEdits(node);
      if (edits) {
        edits.forEach((edit) => edit(code, source));
      } else {
        left.push(node.loc.start.line);
      }
    }
  });
  return { code: code.toString(), left };
}

// A `(done) => { … }` callback, of `it()` and the hooks, or returned by a
// helper that creates them.
function isDoneCallback(node) {
  return (
    /Function/.test(node.type) &&
    node.params.length === 1 &&
    isIdentifier(node.params[0], 'done') &&
    node.body.type === 'BlockStatement'
  );
}

// The edits for a callback that ends with a chain that only checks that the
// promise rejects, or null.
function planRejectionEdits(callback, source) {
  const last = callback.body.body.at(-1);
  let chain = last?.type === 'ExpressionStatement' ? last.expression : null;
  if (isChainCall(chain, 'catch') && isIdentifier(chain.arguments[0], 'done')) {
    chain = chain.callee.object;
  }
  const failed = isChainCall(chain, 'catch') && chain.callee.object;
  if (
    !isChainCall(chain, 'catch') ||
    !isOnlyDoneCall(chain.arguments[0], 0) ||
    !isChainCall(failed, 'then') ||
    failed.arguments.length !== 1 ||
    !isOnlyDoneCall(failed.arguments[0], 1) ||
    countDoneReferences(callback.body) !== countDoneReferences(last)
  ) {
    return null;
  }
  const promise = failed.callee.object;
  return [
    (code) => code.remove(callback.params[0].start, callback.params[0].end),
    (code) =>
      code.overwrite(
        last.expression.start,
        last.expression.end,
        `return expect(${source.slice(promise.start, promise.end)}).rejects.toThrow()`,
      ),
  ];
}

function isChainCall(node, method) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === method
  );
}

// A function that only calls `done` with `count` arguments.
function isOnlyDoneCall(fn, count) {
  if (!/Function/.test(fn?.type)) {
    return false;
  }
  const { body } = fn;
  const statements = body.type === 'BlockStatement' ? body.body : [{ expression: body }];
  const call = statements.length === 1 ? statements[0].expression : null;
  return (
    call?.type === 'CallExpression' &&
    isIdentifier(call.callee, 'done') &&
    call.arguments.length === count
  );
}

function countDoneReferences(node) {
  let count = 0;
  walk(node, (child, parents) => {
    if (isIdentifier(child, 'done') && isReference(child, parents.at(-1))) {
      count++;
    }
  });
  return count;
}

// The edits that convert a callback, or null if it uses `done` in other ways.
function planEdits(callback) {
  const statements = callback.body.body;
  const last = statements.at(-1);
  if (last?.type !== 'ExpressionStatement') {
    return null;
  }
  const awaited = awaitedCallbacks(last.expression);
  const edits = [
    // `(done) =>` -> `() =>`
    (code) => code.remove(callback.params[0].start, callback.params[0].end),
    (code) => code.appendLeft(last.start, 'return '),
  ];
  let references = 0;
  let isConvertible = true;
  walk(callback.body, (node, parents) => {
    if (!isIdentifier(node, 'done') || !isReference(node, parents.at(-1))) {
      return;
    }
    references++;
    const edit = planDoneEdit(node, [callback, ...parents], last, awaited);
    if (edit) {
      edits.push(edit);
    } else {
      isConvertible = false;
    }
  });
  return isConvertible && references > 0 ? edits : null;
}

// The callbacks that the promise chain `expression` waits for: those of its
// calls of the `chainMethods`, and those of the chains that these callbacks
// return, e.g. `query().catch(() => { return other().then(b); })`.
function awaitedCallbacks(expression, callbacks = new Set()) {
  let node = expression;
  while (node?.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    if (chainMethods.has(node.callee.property.name)) {
      for (const fn of node.arguments.filter((argument) => /Function/.test(argument.type))) {
        callbacks.add(fn);
        returnedExpressions(fn).forEach((returned) => awaitedCallbacks(returned, callbacks));
      }
    }
    node = node.callee.object;
  }
  return callbacks;
}

function returnedExpressions(fn) {
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body];
  }
  const returned = [];
  walk(fn.body, (node, parents) => {
    const owner = parents.findLast((parent) => /Function/.test(parent.type));
    if (node.type === 'ReturnStatement' && node.argument && !owner) {
      returned.push(node.argument);
    }
  });
  return returned;
}

function planDoneEdit(node, parents, last, awaited) {
  const parent = parents.at(-1);
  // `.catch(done)` at the end of the chain.
  if (
    parent.type === 'CallExpression' &&
    parent.arguments.length === 1 &&
    parent.arguments[0] === node &&
    parent === last.expression &&
    parent.callee.type === 'MemberExpression' &&
    parent.callee.property.name === 'catch'
  ) {
    return (code) => code.remove(parent.callee.object.end, parent.end);
  }
  // Other calls of `done` need to be in a callback that the chain waits for,
  // and not in a function inside it, which could run after the chain settled.
  const fn = parents.findLast((ancestor) => /Function/.test(ancestor.type));
  if (!awaited.has(fn) || parent.type !== 'CallExpression' || parent.callee !== node) {
    return null;
  }
  const call = parents[parents.indexOf(fn) - 1];
  const end = last.expression;
  if (isOnlyDoneCall(fn, 1)) {
    // `.catch((err) => { done(err); })` at the end of the chain, which the
    // returned promise replaces.
    if (call === end && isChainCall(call, 'catch')) {
      return (code) => code.remove(call.callee.object.end, call.end);
    }
    // `.then(() => { done(error); }).catch(() => { … })` -> `.then(() => {
    // throw error; }, () => { … })`, as the catch callback would also catch the
    // error that fails the test. Catch callbacks that check the error fail the
    // test anyway, and are kept.
    // The parent of `call` is the member expression `call.catch`.
    const next = parents[parents.indexOf(call) - 2];
    const check = next?.arguments?.[0];
    if (
      isChainCall(call, 'then') &&
      call.arguments.length === 1 &&
      isChainCall(next, 'catch') &&
      next.callee.object === call &&
      next.arguments.length === 1 &&
      /Function/.test(check.type) &&
      check.params.length === 0
    ) {
      return (code, source) => {
        convertDoneToThrow(code, source, fn, parent);
        code.overwrite(fn.end, check.start, ', ');
      };
    }
  }
  // `() => done(error)` -> `() => { throw error; }`
  if (fn.body === parent && parent.arguments.length === 1) {
    return (code, source) => convertDoneToThrow(code, source, fn, parent);
  }
  const statement = parents.at(-2);
  const block = parents.at(-3);
  if (statement?.type !== 'ExpressionStatement') {
    return null;
  }
  // `done();` at the end of a callback with other statements.
  if (parent.arguments.length === 0) {
    const isLast = block === fn.body && block.body.at(-1) === statement;
    if (isLast && block.body.length > 1) {
      return (code, source) =>
        code.remove(lineStart(source, statement.start), lineEnd(source, statement.end));
    }
    // `.then(() => { done(); })` at the end of the chain is left out.
    const isChainEnd = call === end || (call === end.callee.object && isChainCall(end, 'catch'));
    if (isLast && isChainCall(call, 'then') && call.arguments.length === 1 && isChainEnd) {
      return (code) => code.remove(call.callee.object.end, call.end);
    }
    return null;
  }
  // `done(error);` -> `throw error;`
  if (parent.arguments.length === 1) {
    return (code, source) => convertDoneToThrow(code, source, fn, parent);
  }
  return null;
}

// `() => done(error)` -> `() => { throw error; }`, and `done(error);` ->
// `throw error;`
function convertDoneToThrow(code, source, fn, call) {
  const [error] = call.arguments;
  if (fn.body === call) {
    code.overwrite(call.start, call.end, `{ throw ${source.slice(error.start, error.end)}; }`);
  } else {
    code.overwrite(call.start, error.start, 'throw ');
    code.remove(error.end, call.end);
  }
}

function lineStart(source, index) {
  while (index > 0 && /[ \t]/.test(source[index - 1])) {
    index--;
  }
  return index;
}

function lineEnd(source, index) {
  return source[index] === '\n' ? index + 1 : index;
}
