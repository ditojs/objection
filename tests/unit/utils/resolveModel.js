import { describe, it, expect } from 'vitest';
import { resolveModel } from '../../../lib/utils/resolveModel.js';
import path from 'node:path';

describe('resolveModule', () => {
  it("should throw a correct error when resolving a module which has a some error in it's body", () => {
    // see GH issue #962
    expect(() => {
      resolveModel(
        path.resolve(import.meta.dirname, '../relations/files/ModelWithARandomError.js'),
      );
    }).toThrow(/some random error/);
  });

  it("should throw a correct error when resolving an ES module which has a some error in it's body", () => {
    expect(() => {
      resolveModel(
        path.resolve(import.meta.dirname, '../relations/files/esm/ModelWithARandomError.js'),
      );
    }).toThrow(/some random error/);
  });
});
