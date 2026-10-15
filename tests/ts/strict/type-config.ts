// The tests in this directory check the typings in strict mode: it's turned on
// for the whole compilation, as the augmentation is global. The other tests in
// ../ run without it.

declare module 'objection' {
  interface TypeConfig {
    strict: true;
  }
}

export {};
