import { describe, it, expect } from 'vitest';
import addFormats from 'ajv-formats';
import { AjvValidator, Model, raw, val, ref } from 'objection';
import Knex from 'knex';
import { expectThrows } from '../../../testUtils/testUtils.js';

function modelClass(tableName, schema) {
  return class TestModel extends Model {
    static get tableName() {
      return tableName;
    }
    static get jsonSchema() {
      return schema;
    }
  };
}

describe('AjvValidator', () => {
  describe('getValidator', () => {
    const schemaA = {
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'string' } },
    };

    const schemaB = {
      type: 'object',
      required: ['b'],
      properties: { b: { type: 'string' } },
    };

    it('should not share validators between model classes with the same uniqueTag', () => {
      const validator = new AjvValidator({});
      const ModelA = modelClass('test', schemaA);
      const ModelB = modelClass('test', schemaB);

      expect(ModelA.uniqueTag()).toBe(ModelB.uniqueTag());

      const validatorA = validator.getValidator(ModelA, ModelA.getJsonSchema(), false);
      const validatorB = validator.getValidator(ModelB, ModelB.getJsonSchema(), false);

      expect(validatorA).not.toBe(validatorB);
      expect(validatorA({ a: 'x' })).toBe(true);
      expect(validatorB({ a: 'x' })).toBe(false);
      expect(validatorB({ b: 'x' })).toBe(true);
    });

    it('should not recompile validators for bound model classes with a shared validator', () => {
      const validator = new AjvValidator({});
      let compileCount = 0;
      const compile = validator.ajv.compile;

      validator.ajv.compile = function (...args) {
        ++compileCount;
        return compile.apply(this, args);
      };

      class TestModel extends Model {
        static get tableName() {
          return 'test';
        }

        static get jsonSchema() {
          return {
            type: 'object',
            required: ['a'],
            properties: { a: { type: 'string' } },
          };
        }

        static createValidator() {
          return validator;
        }
      }

      const BoundModel1 = TestModel.bindKnex(Knex({ client: 'pg' }));
      const BoundModel2 = TestModel.bindKnex(Knex({ client: 'pg' }));

      expect(BoundModel1).not.toBe(BoundModel2);
      expect(BoundModel1.getJsonSchema()).not.toBe(BoundModel2.getJsonSchema());

      BoundModel1.fromJson({ a: 'x' });
      BoundModel2.fromJson({ a: 'x' });
      TestModel.fromJson({ a: 'x' });

      expect(compileCount).toBe(1);
      expect(validator.cache.size).toBe(1);
      expect(() => BoundModel2.fromJson({})).toThrow();
    });

    it('should cache validators separately for patch and non-patch validation', () => {
      const validator = new AjvValidator({});
      const ModelA = modelClass('test', schemaA);
      const jsonSchema = ModelA.getJsonSchema();

      const normalValidator = validator.getValidator(ModelA, jsonSchema, false);
      const patchValidator = validator.getValidator(ModelA, jsonSchema, true);

      expect(normalValidator).not.toBe(patchValidator);
      expect(validator.getValidator(ModelA, jsonSchema, false)).toBe(normalValidator);
      expect(validator.getValidator(ModelA, jsonSchema, true)).toBe(patchValidator);
      expect(normalValidator({})).toBe(false);
      expect(patchValidator({})).toBe(true);
    });

    it('should reuse validators for equal schemas returned by $beforeValidate', () => {
      const validator = new AjvValidator({});
      const ModelA = modelClass('test', schemaA);

      const validator1 = validator.getValidator(ModelA, JSON.parse(JSON.stringify(schemaB)), false);
      const validator2 = validator.getValidator(ModelA, JSON.parse(JSON.stringify(schemaB)), false);

      expect(validator1).toBe(validator2);
      expect(validator1({ b: 'x' })).toBe(true);
      expect(validator1({ a: 'x' })).toBe(false);
    });
  });

  describe('patch validator', () => {
    const schema = {
      definitions: {
        TestRef1: {
          type: 'object',
          properties: {
            aRequiredProp1: { type: 'string' },
          },
          required: ['aRequiredProp1'],
        },
        TestRef2: {
          type: 'object',
          properties: {
            aRequiredProp2: { type: 'string' },
          },
          required: ['aRequiredProp2'],
        },
      },
      anyOf: [{ $ref: '#/definitions/TestRef1' }, { $ref: '#/definitions/TestRef2' }],
    };

    const schemaBis = {
      $defs: {
        TestRef1: {
          type: 'object',
          properties: {
            aRequiredProp1: { type: 'string' },
          },
          required: ['aRequiredProp1'],
        },
        TestRef2: {
          type: 'object',
          properties: {
            aRequiredProp2: { type: 'string' },
          },
          required: ['aRequiredProp2'],
        },
      },
      anyOf: [{ $ref: '#/$defs/TestRef1' }, { $ref: '#/$defs/TestRef2' }],
    };

    const schema2 = {
      type: 'object',
      discriminator: { propertyName: 'foo' },
      required: ['bar', 'foo'],
      properties: {
        bar: {
          type: 'string',
        },
      },
      oneOf: [
        {
          properties: {
            foo: { const: 'x' },
            a: { type: 'string' },
          },
          required: ['a'],
        },
        {
          properties: {
            foo: { enum: ['y', 'z'] },
            b: { type: 'string' },
          },
          required: ['b'],
        },
      ],
    };

    const schema3 = {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date-time',
        },
      },
    };

    const schema4 = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          required: ['city'],
          properties: {
            city: {
              type: 'string',
            },
            zip: {
              type: 'string',
            },
            street: {
              type: 'string',
            },
          },
        },
      },
    };

    it('should remove required fields from definitions', () => {
      const validator = new AjvValidator({});
      const validators = validator.getValidator(modelClass('test', schema), schema, true);
      const definitions = Object.values(validators.schema.definitions);

      expect(definitions.length).toBe(2);
      definitions.forEach((d) => expect(d.required).toBeUndefined());
    });

    it('should remove required fields from $defs', () => {
      const validator = new AjvValidator({ onCreateAjv: () => {} });
      const validators = validator.getValidator(modelClass('test', schemaBis), schemaBis, true);
      const $defs = Object.values(validators.schema.$defs);

      expect($defs.length).toBe(2);
      $defs.forEach((d) => expect(d.required).toBeUndefined());
    });

    it('should not remove required fields if there is a discriminator', () => {
      const validator = new AjvValidator({
        options: {
          discriminator: true,
        },
      });
      const validators = validator.getValidator(modelClass('test', schema2), schema2, true);
      expect(validators.schema.required).toEqual(['foo']);
    });

    it('should add ajv formats by default', () => {
      expect(() => {
        const validator = new AjvValidator({});
        validator.getValidator(modelClass('test', schema3), schema3, true);
      }).not.toThrow();
    });

    it('should remove required fields in inner properties', () => {
      const validator = new AjvValidator({});
      const validators = validator.getValidator(modelClass('test', schema4), schema4, true);
      expect(validators.schema.properties.address.properties).not.toBeUndefined();
      expect(validators.schema.properties.address.required).toBeUndefined();
    });

    it('should not throw errors when adding formats in onCreateAjv hook', () => {
      expect(() => {
        new AjvValidator({
          onCreateAjv: (ajv) => {
            addFormats(ajv);
          },
        });
      }).not.toThrow();
    });

    it('should handle empty definitions', () => {
      const emptyDefinitionsSchema = {
        type: 'object',
        required: ['a'],
        definitions: {},
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
        },
      };
      const validator = new AjvValidator({});
      validator.getValidator(
        modelClass('test', emptyDefinitionsSchema),
        emptyDefinitionsSchema,
        true,
      );
    });

    it('should handle empty $defs', () => {
      const emptyDefinitionsSchema = {
        type: 'object',
        required: ['a'],
        $defs: {},
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
        },
      };
      const validator = new AjvValidator({ onCreateAjv: () => {} });
      validator.getValidator(
        modelClass('test', emptyDefinitionsSchema),
        emptyDefinitionsSchema,
        true,
      );
    });

    function patchValidator(schema) {
      return new AjvValidator({}).getValidator(modelClass('test', schema), schema, true);
    }

    it('should keep required fields inside not', () => {
      const schema = {
        oneOf: [{ not: { required: ['a'] } }],
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.oneOf).toEqual([{ not: { required: ['a'] } }]);
      expect(validate({ b: 'str' })).toBe(true);
      expect(validate({ a: 'str' })).toBe(false);
    });

    for (const prop of ['anyOf', 'oneOf']) {
      it(`should not require patches to match other ${prop} options if one only has required`, () => {
        const schema = {
          [prop]: [{ required: ['a'] }, { required: ['b'], properties: { b: { type: 'number' } } }],
          properties: {
            a: { type: 'string' },
            b: {},
          },
        };
        const validate = patchValidator(schema);
        expect(validate.schema[prop]).toBeUndefined();
        expect(validate({ a: 'str', b: 'str' })).toBe(true);
        expect(validate({ b: 1 })).toBe(true);
        expect(validate({ a: 1 })).toBe(false);
      });

      it(`should not require nested objects to match other ${prop} options if one only has required`, () => {
        const schema = {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              [prop]: [
                { required: ['a'] },
                { required: ['b'], properties: { b: { type: 'number' } } },
              ],
              properties: {
                a: { type: 'string' },
                b: {},
              },
            },
          },
        };
        const validate = patchValidator(schema);
        expect(validate.schema.properties.data[prop]).toBeUndefined();
        expect(validate({ data: {} })).toBe(true);
        expect(validate({ data: { b: 1 } })).toBe(true);
        expect(validate({ data: { b: 'str' } })).toBe(true);
        expect(validate({ data: { a: 1 } })).toBe(false);
      });
    }

    it('should keep allOf options that still have constraints', () => {
      const schema = {
        allOf: [{ required: ['a'] }, { required: ['b'], properties: { b: { type: 'number' } } }],
      };
      const validate = patchValidator(schema);
      expect(validate.schema.allOf).toEqual([{ properties: { b: { type: 'number' } } }]);
      expect(validate({ b: 'str' })).toBe(false);
    });

    it('should keep top-level not schemas intact', () => {
      const schema = {
        type: 'object',
        required: ['a'],
        not: { required: ['b', 'c'] },
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.required).toBeUndefined();
      expect(validate.schema.not).toEqual({ required: ['b', 'c'] });
      expect(validate({ b: 'str' })).toBe(true);
      expect(validate({ b: 'str', c: 'str' })).toBe(false);
    });

    it('should remove required fields in inner properties of nullable objects', () => {
      const schema = {
        type: 'object',
        properties: {
          address: {
            type: ['object', 'null'],
            required: ['city'],
            properties: {
              city: { type: 'string' },
              zip: { type: 'string' },
              inner: {
                type: 'object',
                required: ['a'],
                properties: { a: { type: 'string' } },
              },
            },
          },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.properties.address.required).toBeUndefined();
      expect(validate.schema.properties.address.properties.inner.required).toBeUndefined();
      expect(validate({ address: { zip: '123', inner: {} } })).toBe(true);
      expect(validate({ address: null })).toBe(true);
      expect(validate({ address: { zip: 123 } })).toBe(false);
    });

    it('should remove required fields in inner properties of untyped schemas', () => {
      const schema = {
        required: ['address'],
        properties: {
          address: {
            required: ['city'],
            properties: {
              city: { type: 'string' },
              zip: { type: 'string' },
            },
          },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.required).toBeUndefined();
      expect(validate.schema.properties.address.required).toBeUndefined();
      expect(validate({ address: { zip: '123' } })).toBe(true);
      expect(validate({ address: { zip: 123 } })).toBe(false);
    });

    it('should keep properties named like schema keywords in untyped schemas', () => {
      const schema = {
        properties: {
          required: { type: 'string' },
          not: { type: 'string' },
          anyOf: { type: 'string' },
          properties: { type: 'string' },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.properties).toEqual(schema.properties);
      expect(validate({ required: 'a', not: 'b', anyOf: 'c', properties: 'd' })).toBe(true);
      expect(validate({ required: 1 })).toBe(false);
      expect(validate({ not: 1 })).toBe(false);
      expect(validate({ anyOf: 1 })).toBe(false);
      expect(validate({ properties: 1 })).toBe(false);
    });
  });

  describe('patch validation with field expression keys', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        meta: {
          type: 'object',
          additionalProperties: false,
          required: ['a'],
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
            nested: {
              type: 'object',
              additionalProperties: false,
              required: ['x'],
              properties: {
                x: { type: 'integer' },
                y: { type: 'integer' },
              },
            },
          },
        },
        tags: {
          type: 'array',
          minItems: 2,
          items: { type: 'string' },
        },
      },
    };

    function createModelClass(options) {
      return class TestModel extends modelClass('test', schema) {
        static createValidator() {
          return new AjvValidator({ options });
        }
      };
    }

    const TestModel = createModelClass();

    function validationErrorData(fn) {
      try {
        fn();
      } catch (err) {
        expect(err).toBeInstanceOf(TestModel.ValidationError);
        return err.data;
      }
      throw new Error('expected a validation error');
    }

    it('should validate field expression keys against the nested schema', () => {
      const model = TestModel.fromJson({ 'meta:b': 'foo' }, { patch: true });
      expect(model['meta:b']).toBe('foo');

      const data = validationErrorData(() => TestModel.fromJson({ 'meta:b': 1 }, { patch: true }));
      expect(Object.keys(data)).toEqual(['meta.b']);
      expect(data['meta.b'][0].keyword).toBe('type');
    });

    it('should not fail on nested required properties of untouched siblings', () => {
      expect(() => {
        TestModel.fromJson({ 'meta:nested.y': 1, 'meta:b': 'foo' }, { patch: true });
      }).not.toThrow();
    });

    it('should validate multiple field expression keys of the same column', () => {
      expect(() => {
        TestModel.fromJson(
          { name: 'foo', 'meta:a': 'a', 'meta:b': 'b', 'meta:nested.x': 1 },
          { patch: true },
        );
      }).not.toThrow();

      const data = validationErrorData(() =>
        TestModel.fromJson({ 'meta:a': 1, 'meta:nested.x': 'x' }, { patch: true }),
      );
      expect(Object.keys(data).sort()).toEqual(['meta.a', 'meta.nested.x']);
    });

    it('should report additional properties inside the json column', () => {
      const data = validationErrorData(() =>
        TestModel.fromJson({ 'meta:c': 'foo' }, { patch: true }),
      );
      expect(Object.keys(data)).toEqual(['meta.c']);
      expect(data['meta.c'][0].keyword).toBe('additionalProperties');
    });

    it('should report unknown columns of field expression keys', () => {
      const data = validationErrorData(() =>
        TestModel.fromJson({ 'unknown:b': 'foo' }, { patch: true }),
      );
      expect(Object.keys(data)).toEqual(['unknown']);
      expect(data.unknown[0].keyword).toBe('additionalProperties');
    });

    it('should support table prefixes in field expression keys', () => {
      expect(() => {
        TestModel.fromJson({ 'test.meta:b': 'foo' }, { patch: true });
      }).not.toThrow();
    });

    it('should not validate field expression keys with array access', () => {
      expect(() => {
        TestModel.fromJson({ 'tags:[0]': 'foo', 'meta:nested[0]': 1 }, { patch: true });
      }).not.toThrow();
    });

    it('should not modify the input json', () => {
      const json = { name: 'foo', 'meta:b': 'foo' };
      const model = TestModel.fromJson(json, { patch: true });
      expect(json).toEqual({ name: 'foo', 'meta:b': 'foo' });
      expect(model).toEqual({ name: 'foo', 'meta:b': 'foo' });
    });

    it('should apply type coercion to field expression values', () => {
      const CoercingModel = createModelClass({ coerceTypes: true });
      const model = CoercingModel.fromJson({ 'meta:b': 1, 'meta:nested.x': '2' }, { patch: true });
      expect(model['meta:b']).toBe('1');
      expect(model['meta:nested.x']).toBe(2);
    });

    it('should apply removeAdditional to field expression keys', () => {
      const RemovingModel = createModelClass({ removeAdditional: 'all' });
      const model = RemovingModel.fromJson(
        { 'meta:b': 'foo', 'meta:c': 'bar', 'unknown:a': 1 },
        { patch: true },
      );
      expect(model).toEqual({ 'meta:b': 'foo' });
    });

    it('should not change the validation of field expression keys in non-patch mode', () => {
      const data = validationErrorData(() => TestModel.fromJson({ name: 'foo', 'meta:b': 'foo' }));
      expect(Object.keys(data)).toEqual(['meta:b']);
    });
  });

  describe('required properties given as query properties', () => {
    const TestModel = modelClass('test', {
      type: 'object',
      required: ['a', 'b'],
      properties: {
        a: { type: 'array', items: { type: 'string' } },
        b: { type: 'integer' },
        c: { type: 'string', default: 'c' },
      },
    });

    function validationErrorData(fn) {
      try {
        fn();
      } catch (err) {
        expect(err).toBeInstanceOf(TestModel.ValidationError);
        return err.data;
      }
      throw new Error('expected a validation error');
    }

    it('should count required properties given as query properties as present', () => {
      const model = TestModel.fromJson({
        a: val(['x']).asArray().castTo('uuid[]'),
        b: raw('?', 1),
      });
      expect(model.c).toBe('c');
      expect(TestModel.fromJson({ a: ['x'], b: ref('c') }).a).toEqual(['x']);
      expect(TestModel.fromJson({ a: TestModel.query().select('a'), b: 1 }).b).toBe(1);
    });

    it('should still require the other required properties', () => {
      const data = validationErrorData(() => TestModel.fromJson({ a: raw('?', 1) }));
      expect(Object.keys(data)).toEqual(['b']);
      expect(data.b[0].keyword).toBe('required');
      expect(Object.keys(validationErrorData(() => TestModel.fromJson({ b: raw('1') })))).toEqual([
        'a',
      ]);
    });

    it('should still validate the other properties', () => {
      const data = validationErrorData(() => TestModel.fromJson({ a: raw('?', 1), b: 'x' }));
      expect(Object.keys(data)).toEqual(['b']);
      expect(data.b[0].keyword).toBe('type');
    });

    it('should not affect the validation of models without query properties', () => {
      TestModel.fromJson({ a: raw('?', 1), b: raw('?', 1) });
      const data = validationErrorData(() => TestModel.fromJson({}));
      expect(Object.keys(data).sort()).toEqual(['a', 'b']);
    });

    it('should work with schemas that have an $id', () => {
      const IdModel = modelClass('IdModel', {
        $id: 'IdModel',
        type: 'object',
        required: ['a', 'b'],
        properties: {
          a: { type: 'string' },
          b: { $ref: '#/definitions/b' },
          c: { $id: 'IdModelC', type: 'object' },
        },
        definitions: {
          b: { type: 'integer' },
        },
      });

      IdModel.fromJson({ a: 'x', b: 1 });
      expect(IdModel.fromJson({ a: 'x', b: raw('?', 1) }).a).toBe('x');
      expect(IdModel.fromJson({ a: raw('?', 'x'), b: 1 }).b).toBe(1);
      expect(IdModel.fromJson({ a: raw('?', 'x'), b: raw('?', 1) })).toBeInstanceOf(IdModel);
      expectThrows(
        () => IdModel.fromJson({ a: raw('?', 'x'), b: 'x' }),
        (err) => {
          expect(err.data.b[0].keyword).toBe('type');
        },
      );
    });
  });
});
