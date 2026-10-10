// Converts expect.js and chai assertions to vitest's `expect`, e.g.
// `expect(a).to.eql(b)` -> `expect(a).toEqual(b)`. Assertions it can't map are
// left for the residual patch.

import path from 'node:path';
import MagicString from 'magic-string';
import { parseModule, walk } from '../lib/ast.js';
import { testFiles } from './tests.js';

export const description = 'expect.js and chai assertions to vitest';

const libraries = new Set(['expect.js', 'chai', 'chai-subset']);

// The words of an assertion chain that only make it read well.
const fillers = new Set('to be been is have has that which and with at of deep an a'.split(' '));

// Assertions without call, e.g. `expect(a).to.be.true`.
const propertyMatchers = new Map([
  ['true', 'toBe(true)'],
  ['false', 'toBe(false)'],
  ['null', 'toBeNull()'],
  ['undefined', 'toBeUndefined()'],
  ['ok', 'toBeTruthy()'],
]);

// Assertions that map to a vitest matcher with the same arguments.
const matcherNames = new Map([
  ['instanceOf', 'toBeInstanceOf'],
  ['instanceof', 'toBeInstanceOf'],
  ['length', 'toHaveLength'],
  ['lengthOf', 'toHaveLength'],
  ['contain', 'toContain'],
  ['contains', 'toContain'],
  ['include', 'toContain'],
  ['includes', 'toContain'],
  ['match', 'toMatch'],
  ['greaterThan', 'toBeGreaterThan'],
  ['above', 'toBeGreaterThan'],
  ['lessThan', 'toBeLessThan'],
  ['below', 'toBeLessThan'],
  // A custom matcher, see testUtils/setup.js.
  ['containSubset', 'toContainSubset'],
]);

// The types of `expect(a).to.be.an('array')` that are classes for vitest.
const typeClasses = new Map([
  ['array', 'Array'],
  ['regexp', 'RegExp'],
  ['error', 'Error'],
]);

// The helpers that the converted assertions use, added to testUtils/testUtils.js
// after `expectPartialEqual()`.
const helperFile = 'testUtils/testUtils.js';
const helperDefinitions = {
  expectThrows: `/**
 * Expect that \`fn\` throws, and pass the thrown error to \`check\` to make further
 * assertions about it.
 */
export function expectThrows(fn, check) {
  let error;

  try {
    fn();
  } catch (err) {
    error = err;
  }

  expect(error, 'expected function to throw').toBeDefined();
  check(error);
}`,
};

export function run(access) {
  const problems = [];
  const helpers = new Set();
  for (const file of testFiles(access)) {
    const source = access.read(file);
    const result = convertAssertions(file, source);
    problems.push(...result.problems.map((problem) => `${file}:${problem}`));
    result.helpers.forEach((helper) => helpers.add(helper));
    if (result.code !== source) {
      access.write(file, result.code);
    }
  }
  defineHelpers(access, helpers);
  return problems;
}

function convertAssertions(file, source) {
  const program = parseModule(source);
  const code = new MagicString(source);
  const { expectNames, chaiNamespaces, removable } = findLibraries(program);
  const problems = [];
  const converted = [];
  const helpers = new Set();

  walk(program, (node, parents) => {
    if (node.type !== 'CallExpression' || !isExpectCall(node, expectNames, chaiNamespaces)) {
      return;
    }
    // Skip the assertions inside a part that an outer assertion replaced, e.g.
    // inside its throw callback.
    if (converted.some(([start, end]) => node.start >= start && node.end <= end)) {
      return;
    }
    const chain = readChain(node, parents);
    const text = (part) => source.slice(part.start, part.end);
    const fail = (why) => {
      const [assertion] = text(chain.end).split('\n');
      problems.push(`${node.loc.start.line}: ${why}: ${assertion}`);
    };
    if (chain.continues) {
      return fail('chain continues after the assertion');
    }
    if (!chain.words.length) {
      return fail('bare expect');
    }
    const matcher = mapAssertion(node, chain, text);
    if (matcher.problem) {
      return fail(matcher.problem);
    }

    if (matcher.helper) {
      // `expect(fn).to.throwException(check)` -> `expectThrows(fn, check)`
      const [check] = chain.call.arguments;
      code.overwrite(node.callee.start, node.callee.end, matcher.helper);
      code.overwrite(node.arguments[0].end, check.start, ', ');
      code.overwrite(check.end, chain.end.end, ')');
      helpers.add(matcher.helper);
      return;
    }
    if (node.callee.type !== 'Identifier' || node.callee.name !== 'expect') {
      code.overwrite(node.callee.start, node.callee.end, 'expect');
    }
    if (matcher.subject) {
      const [subject] = node.arguments;
      code.overwrite(subject.start, subject.end, matcher.subject);
    }
    const prefix = chain.words.includes('not') ? '.not.' : '.';
    if (matcher.replacement) {
      code.overwrite(node.end, chain.end.end, prefix + matcher.replacement);
      converted.push([node.end, chain.end.end]);
    } else {
      code.overwrite(node.end, chain.call.callee.end, prefix + matcher.name);
      const [argument] = chain.call.arguments;
      if (matcher.argument) {
        code.overwrite(argument.start, argument.end, matcher.argument);
      }
      if (matcher.wrapArgument) {
        code.prependLeft(argument.start, '[');
        code.appendRight(argument.end, ']');
      }
    }
  });

  for (const node of removable) {
    code.remove(node.start, source[node.end] === '\n' ? node.end + 1 : node.end);
  }
  if (helpers.size) {
    importHelpers(program, code, file, [...helpers]);
  }
  return { code: code.toString(), problems, helpers };
}

// The imports of the assertion libraries, and `chai.use()` calls, which are all
// removed.
function findLibraries(program) {
  const expectNames = new Set();
  const chaiNamespaces = new Set();
  const removable = [];
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration' && libraries.has(node.source.value)) {
      for (const specifier of node.specifiers) {
        const isNamespace = node.source.value === 'chai' && specifier.type !== 'ImportSpecifier';
        (isNamespace ? chaiNamespaces : expectNames).add(specifier.local.name);
      }
      removable.push(node);
    }
  }
  for (const node of program.body) {
    const callee = node.type === 'ExpressionStatement' && node.expression.callee;
    if (callee?.type === 'MemberExpression' && chaiNamespaces.has(callee.object.name)) {
      if (callee.property.name === 'use') {
        removable.push(node);
      }
    }
  }
  return { expectNames, chaiNamespaces, removable };
}

// `expect(…)`, or `chai.expect(…)`
function isExpectCall(node, expectNames, chaiNamespaces) {
  const { callee } = node;
  return callee.type === 'Identifier'
    ? expectNames.has(callee.name)
    : callee.type === 'MemberExpression' &&
        chaiNamespaces.has(callee.object.name) &&
        callee.property.name === 'expect';
}

// Reads the chain after `expect(…)`: its words, the final call if there is one,
// and the node that ends the assertion.
function readChain(node, parents) {
  const words = [];
  let end = node;
  let call = null;
  let index = parents.length - 1;
  while (index >= 0) {
    const parent = parents[index];
    if (parent.type === 'MemberExpression' && parent.object === end && !parent.computed) {
      words.push(parent.property.name);
    } else if (parent.type === 'CallExpression' && parent.callee === end) {
      call = parent;
    } else {
      break;
    }
    end = parent;
    index--;
    if (call) {
      break;
    }
  }
  const next = parents[index];
  const continues = Boolean(call && next?.type === 'MemberExpression' && next.object === call);
  return { words, call, end, continues };
}

// The vitest matcher for an assertion chain: either a `replacement` for all
// of the chain, or the `name` of the matcher that replaces the chain's words,
// keeping its arguments (with optional changes to the first one).
function mapAssertion(node, { words, call }, text) {
  const chainWords = words.filter((word) => word !== 'not');
  const name = chainWords.at(-1);
  if (!chainWords.slice(0, -1).every((word) => fillers.has(word))) {
    return { problem: `unknown chain ${words.join('.')}` };
  }
  const subjectAssertion = mapSubjectAssertion(node, name, call, words, text);
  if (subjectAssertion) {
    return subjectAssertion;
  }
  if (!call) {
    const replacement = propertyMatchers.get(name);
    return replacement ? { replacement } : { problem: 'property assertion' };
  }
  const args = call.arguments;
  if (['be', 'equal', 'equals', 'eql', 'eqls'].includes(name)) {
    return mapEqualityAssertion(name, call, words);
  }
  if (name === 'ok' && args.length === 0) {
    return { replacement: 'toBeTruthy()' };
  }
  if (['a', 'an'].includes(name) && args.length === 1) {
    return mapTypeAssertion(args[0]);
  }
  if (name === 'property' && args.length === 1) {
    // Property names with dots or brackets are paths for vitest.
    const isPlain = typeof args[0].value === 'string' && !/[.[\]]/.test(args[0].value);
    return { name: 'toHaveProperty', wrapArgument: !isPlain };
  }
  if (name === 'key' && args.length === 1) {
    return { subject: `Object.keys(${text(node.arguments[0])})`, name: 'toContain' };
  }
  if (['throwException', 'throwError', 'throw'].includes(name)) {
    return mapThrowAssertion(name, args, words.includes('not'), text);
  }
  if (matcherNames.has(name)) {
    return { name: matcherNames.get(name) };
  }
  return { problem: 'unknown matcher' };
}

// Assertions that a comparison in the subject is true, e.g.
// `expect(a === 3).to.equal(true)` -> `expect(a).toBe(3)` and
// `expect(a instanceof B).to.be.ok()` -> `expect(a).toBeInstanceOf(B)`.
function mapSubjectAssertion(node, name, call, words, text) {
  const [subject] = node.arguments;
  if (words.includes('not') || node.arguments.length !== 1 || subject.type !== 'BinaryExpression') {
    return null;
  }
  const [argument] = call?.arguments ?? [];
  const isOk = name === 'ok' && call?.arguments.length === 0;
  const isTrue = ['be', 'equal'].includes(name) && argument?.value === true;
  const right = text(subject.right);
  if (subject.operator === 'instanceof' && isOk) {
    return { subject: text(subject.left), replacement: `toBeInstanceOf(${right})` };
  }
  if (subject.operator === '===' && subject.right.type === 'Literal' && isTrue) {
    return { subject: text(subject.left), replacement: `toBe(${right})` };
  }
  return null;
}

// `expect(a).to.be(b)`, `expect(a).to.eql(b)`: primitive values are compared with
// `toBe()`, or the matchers for null and undefined.
//
// expect.js's `eql()` compares primitives loosely, with `==`, and vitest has no
// matcher for that. The strict matchers only fail where `eql()` passed, which
// the tests then show, but negated, they pass where `not.eql()` failed, so
// those are left for the residual patch.
function mapEqualityAssertion(name, call, words) {
  const args = call.arguments;
  const isLoose = ['eql', 'eqls'].includes(name);
  if (isLoose && words.includes('not')) {
    return { problem: 'negated loose equality' };
  }
  const deep = words.includes('deep');
  const [argument] = args;
  if (args.length === 1 && argument.type === 'Identifier' && argument.name === 'undefined') {
    return { replacement: 'toBeUndefined()' };
  }
  if (args.length === 1 && argument.type === 'Literal' && !argument.regex) {
    if (argument.value === null) {
      return { replacement: 'toBeNull()' };
    }
    // Long strings that are wrapped to a line of their own, like the expected
    // SQL of a query, read better with `toEqual()`.
    const isWrapped = argument.loc.start.line > call.loc.start.line;
    const isLongString = isLoose && typeof argument.value === 'string' && isWrapped;
    return { name: isLongString ? 'toEqual' : 'toBe' };
  }
  const isStrict = ['be', 'equal', 'equals'].includes(name) && !deep;
  return { name: isStrict ? 'toBe' : 'toEqual' };
}

// `expect(a).to.be.an('array')`, `expect(a).to.be.a(Model)`
function mapTypeAssertion(argument) {
  if (typeof argument.value !== 'string') {
    return { name: 'toBeInstanceOf' };
  }
  const className = typeClasses.get(argument.value);
  return className ? { name: 'toBeInstanceOf', argument: className } : { name: 'toBeTypeOf' };
}

// `expect(fn).to.throwException(/message/)`, chai's `expect(fn).to.throw(message)`,
// and expect.js's callbacks that check the error, which become `expectThrows()`
// calls, see testUtils/testUtils.js, unless vitest has a matcher for the check.
function mapThrowAssertion(name, args, not, text) {
  if (args.length === 0) {
    return { replacement: 'toThrow()' };
  }
  const [argument] = args;
  if (args.length > 1) {
    return { problem: 'throw arguments' };
  }
  if (argument.regex) {
    return { name: 'toThrow' };
  }
  if (!/Function/.test(argument.type)) {
    // chai matches strings as part of the message, like vitest.
    return name === 'throw' && !not ? { name: 'toThrow' } : { problem: 'throw arguments' };
  }
  // A callback only runs if the function throws.
  if (not) {
    return { replacement: 'toThrow()' };
  }
  const statements =
    argument.body.type === 'BlockStatement'
      ? argument.body.body
      : [{ type: 'ExpressionStatement', expression: argument.body }];
  const [statement] = statements;
  const param = argument.params[0]?.name;
  const matcher =
    statements.length === 1 && statement.type === 'ExpressionStatement'
      ? mapThrowCheck(text(statement.expression), param)
      : null;
  return matcher ?? { helper: 'expectThrows' };
}

// The matcher for a throw callback's single check of the error, or null.
function mapThrowCheck(check, param) {
  const message = new RegExp(
    `^expect\\(\\s*${param}\\.message\\s*\\)\\.to\\.(equal|contain|match)\\(([\\s\\S]*)\\)$`,
  ).exec(check);
  if (message) {
    const [, assertion, value] = message;
    const expected = value.trim().replace(/,$/, '');
    return {
      replacement:
        assertion === 'equal'
          ? `toThrow(expect.objectContaining({ message: ${expected} }))`
          : `toThrow(${expected})`,
    };
  }
  const type = new RegExp(`^expect\\(${param}\\)\\.to\\.be\\.an?\\((\\w+)\\)$`).exec(check);
  if (type) {
    return { replacement: `toThrow(${type[1]})` };
  }
  // `expect(/message/.test(err.message)).to.equal(true)`
  const test = new RegExp(
    `^expect\\(\\s*(\\/.+\\/[a-z]*)\\.test\\(\\s*${param}\\.message,?\\s*\\),?\\s*\\)\\.to\\.(equal\\(true\\)|be\\.ok\\(\\))$`,
  ).exec(check);
  return test ? { replacement: `toThrow(${test[1]})` } : null;
}

function defineHelpers(access, helpers) {
  const source = access.read(helperFile);
  const exported = new Map(
    parseModule(source)
      .body.filter((node) => node.type === 'ExportNamedDeclaration' && node.declaration?.id)
      .map((node) => [node.declaration.id.name, node]),
  );
  const missing = [...helpers].filter((name) => !exported.has(name));
  if (missing.length) {
    const end = exported.get('expectPartialEqual')?.end ?? source.trimEnd().length;
    const text = missing.map((name) => `\n\n${helperDefinitions[name]}`).join('');
    access.write(helperFile, `${source.slice(0, end)}${text}${source.slice(end)}`);
  }
}

// Imports the test helpers that the assertions use from testUtils/testUtils.js,
// adding them to an import from there if the file has one.
function importHelpers(program, code, file, helpers) {
  let from = path.posix.relative(path.posix.dirname(file), 'testUtils/testUtils.js');
  from = from.startsWith('.') ? from : `./${from}`;
  const imports = program.body.filter((node) => node.type === 'ImportDeclaration');
  const existing = imports.find((node) => node.source.value === from);
  if (!existing) {
    code.appendLeft(imports.at(-1).end, `\nimport { ${helpers.join(', ')} } from '${from}';`);
    return;
  }
  for (const helper of helpers) {
    const next = existing.specifiers.find((specifier) => specifier.local.name > helper);
    if (next) {
      code.appendLeft(next.start, `${helper}, `);
    } else {
      code.appendLeft(existing.specifiers.at(-1).end, `, ${helper}`);
    }
  }
}
