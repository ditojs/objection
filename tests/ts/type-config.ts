// The tests in this directory check the loose typings: strict mode is turned
// off for the whole compilation, as the augmentation is global. The tests of
// strict mode in ./strict run with their own tsconfig.json.

declare module 'objection' {
  interface TypeConfig {
    strict: false;
  }
}

export {};
