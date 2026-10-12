// Measures the check time of the typings in strict and loose mode, on a
// sample app generated from the modules in ./app: `copies` copies of its
// models, each with `queries` copies of its query modules.
//
//   node tests/bench/typings/bench.js [--runs 3] [--copies 2] [--queries 4]
//     [--tsc path/to/tsc.js]...
//
// Without --tsc, the local TypeScript runs. Compilers that support
// --generateTrace (TypeScript 5) also report the slowest file.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const dirname = import.meta.dirname;
const root = path.resolve(dirname, '../../..');

const { values: options } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    copies: { type: 'string', default: '2' },
    queries: { type: 'string', default: '4' },
    tsc: { type: 'string', multiple: true, default: [] },
  },
});

const runs = +options.runs;
const compilers = options.tsc.length
  ? options.tsc.map((file) => path.resolve(file))
  : [path.join(root, 'node_modules/typescript/bin/tsc')];

// Generate the sample app:
const generatedDir = path.join(dirname, '.generated');
fs.rmSync(generatedDir, { recursive: true, force: true });
const appDir = path.join(dirname, 'app');
const modelFiles = ['base.ts', 'models.ts'];
let lines = 0;
for (let copy = 0; copy < +options.copies; copy++) {
  const copyDir = path.join(generatedDir, 'app', `copy${copy}`);
  fs.mkdirSync(copyDir, { recursive: true });
  for (const file of fs.readdirSync(appDir)) {
    const source = fs.readFileSync(path.join(appDir, file), 'utf8');
    const count = modelFiles.includes(file) ? 1 : +options.queries;
    for (let query = 0; query < count; query++) {
      const name = count > 1 ? file.replace('.ts', `${query}.ts`) : file;
      fs.writeFileSync(path.join(copyDir, name), source);
      lines += source.split('\n').length;
    }
  }
}

// One project per mode. Loose mode opts out with the `TypeConfig` augmentation.
// The checks for declaration emit of the type tests aren't measured:
const extendsConfig = path.relative(generatedDir, path.join(root, 'tsconfig.json'));
for (const mode of ['strict', 'loose']) {
  const include = ['app/**/*.ts', ...(mode === 'loose' ? ['loose.ts'] : [])];
  const compilerOptions = { declaration: false };
  fs.writeFileSync(
    path.join(generatedDir, `tsconfig.${mode}.json`),
    JSON.stringify({ extends: extendsConfig, compilerOptions, include, exclude: [] }, null, 2),
  );
}
fs.writeFileSync(
  path.join(generatedDir, 'loose.ts'),
  `declare module 'objection' {\n  interface TypeConfig {\n    strict: false;\n  }\n}\n\nexport {};\n`,
);

console.log(`Sample: ${+options.copies} x 10 models, ${lines} lines, ${runs} runs.`);

for (const compiler of compilers) {
  const version = run(compiler, ['--version']).trim();
  const results = {};
  for (const mode of ['strict', 'loose']) {
    const project = path.join(generatedDir, `tsconfig.${mode}.json`);
    const times = [];
    let instantiations;
    for (let i = 0; i < runs; i++) {
      const output = run(compiler, ['-p', project, '--extendedDiagnostics']);
      times.push(parseFloat(output.match(/Check time:\s+([\d.]+)s/)[1]));
      instantiations = output.match(/Instantiations:\s+(\d+)/)[1];
    }
    times.sort((a, b) => a - b);
    results[mode] = { time: times[runs >> 1], instantiations };
    console.log(
      `${version}, ${mode}: check time ${results[mode].time}s (median), ${instantiations} instantiations`,
    );
  }
  console.log(
    `${version}: strict / loose check time ${(results.strict.time / results.loose.time).toFixed(2)}x`,
  );

  // The slowest file in strict mode, from the trace of compilers that write one:
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'objection-trace-'));
  try {
    run(compiler, [
      '-p',
      path.join(generatedDir, 'tsconfig.strict.json'),
      '--generateTrace',
      traceDir,
    ]);
    const events = JSON.parse(fs.readFileSync(path.join(traceDir, 'trace.json'), 'utf8'));
    // checkSourceFile is traced as begin and end events per thread, in
    // microseconds:
    const files = [];
    const openFiles = {};
    for (const event of events.filter((event) => event.name === 'checkSourceFile')) {
      if (event.ph === 'B') {
        openFiles[event.tid] = { path: event.args.path, start: event.ts };
        files.push(openFiles[event.tid]);
      } else {
        openFiles[event.tid].duration = event.ts - openFiles[event.tid].start;
      }
    }
    const slowest = files.sort((a, b) => b.duration - a.duration)[0];
    console.log(
      `${version}, strict: slowest file ${slowest.path.split('/.generated/')[1]} ${(slowest.duration / 1e6).toFixed(2)}s`,
    );
  } catch {
    // The compiler doesn't support --generateTrace.
  } finally {
    fs.rmSync(traceDir, { recursive: true, force: true });
  }
}

function run(compiler, args) {
  // tsc exits with 1 on type errors, which the sample must not have.
  return execFileSync(process.execPath, [compiler, ...args], { cwd: root, encoding: 'utf8' });
}
