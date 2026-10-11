// Opts in to strict mode for all files of this compilation. The augmentation
// is global, so the strict tests run with their own tsconfig.json.

declare module 'objection' {
  interface TypeConfig {
    strict: true;
  }
}

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Expect<T extends true> = T;
