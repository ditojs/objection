const addFormats = require('ajv-formats');
const { AjvValidator, Model } = require('../../../');
const expect = require('expect.js');
const Knex = require('knex');

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

      expect(ModelA.uniqueTag()).to.equal(ModelB.uniqueTag());

      const validatorA = validator.getValidator(ModelA, ModelA.getJsonSchema(), false);
      const validatorB = validator.getValidator(ModelB, ModelB.getJsonSchema(), false);

      expect(validatorA).to.not.be(validatorB);
      expect(validatorA({ a: 'x' })).to.be(true);
      expect(validatorB({ a: 'x' })).to.be(false);
      expect(validatorB({ b: 'x' })).to.be(true);
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

      expect(BoundModel1).to.not.be(BoundModel2);
      expect(BoundModel1.getJsonSchema()).to.not.be(BoundModel2.getJsonSchema());

      BoundModel1.fromJson({ a: 'x' });
      BoundModel2.fromJson({ a: 'x' });
      TestModel.fromJson({ a: 'x' });

      expect(compileCount).to.be(1);
      expect(validator.cache.size).to.be(1);
      expect(() => BoundModel2.fromJson({})).to.throwException();
    });

    it('should cache validators separately for patch and non-patch validation', () => {
      const validator = new AjvValidator({});
      const ModelA = modelClass('test', schemaA);
      const jsonSchema = ModelA.getJsonSchema();

      const normalValidator = validator.getValidator(ModelA, jsonSchema, false);
      const patchValidator = validator.getValidator(ModelA, jsonSchema, true);

      expect(normalValidator).to.not.be(patchValidator);
      expect(validator.getValidator(ModelA, jsonSchema, false)).to.be(normalValidator);
      expect(validator.getValidator(ModelA, jsonSchema, true)).to.be(patchValidator);
      expect(normalValidator({})).to.be(false);
      expect(patchValidator({})).to.be(true);
    });

    it('should reuse validators for equal schemas returned by $beforeValidate', () => {
      const validator = new AjvValidator({});
      const ModelA = modelClass('test', schemaA);

      const validator1 = validator.getValidator(ModelA, JSON.parse(JSON.stringify(schemaB)), false);
      const validator2 = validator.getValidator(ModelA, JSON.parse(JSON.stringify(schemaB)), false);

      expect(validator1).to.be(validator2);
      expect(validator1({ b: 'x' })).to.be(true);
      expect(validator1({ a: 'x' })).to.be(false);
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

      expect(definitions.length).to.be(2);
      definitions.forEach((d) => expect(d.required).to.be(undefined));
    });

    it('should remove required fields from $defs', () => {
      const validator = new AjvValidator({ onCreateAjv: () => {} });
      const validators = validator.getValidator(modelClass('test', schemaBis), schemaBis, true);
      const $defs = Object.values(validators.schema.$defs);

      expect($defs.length).to.be(2);
      $defs.forEach((d) => expect(d.required).to.be(undefined));
    });

    it('should not remove required fields if there is a discriminator', () => {
      const validator = new AjvValidator({
        options: {
          discriminator: true,
        },
      });
      const validators = validator.getValidator(modelClass('test', schema2), schema2, true);
      expect(validators.schema.required).to.eql(['foo']);
    });

    it('should add ajv formats by default', () => {
      expect(() => {
        const validator = new AjvValidator({});
        validator.getValidator(modelClass('test', schema3), schema3, true);
      }).to.not.throwException();
    });

    it('should remove required fields in inner properties', () => {
      const validator = new AjvValidator({});
      const validators = validator.getValidator(modelClass('test', schema4), schema4, true);
      expect(validators.schema.properties.address.properties).to.not.be(undefined);
      expect(validators.schema.properties.address.required).to.be(undefined);
    });

    it('should not throw errors when adding formats in onCreateAjv hook', () => {
      expect(() => {
        new AjvValidator({
          onCreateAjv: (ajv) => {
            addFormats(ajv);
          },
        });
      }).to.not.throwException();
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
        expect(err).to.be.a(TestModel.ValidationError);
        return err.data;
      }
      throw new Error('expected a validation error');
    }

    it('should validate field expression keys against the nested schema', () => {
      const model = TestModel.fromJson({ 'meta:b': 'foo' }, { patch: true });
      expect(model['meta:b']).to.equal('foo');

      const data = validationErrorData(() => TestModel.fromJson({ 'meta:b': 1 }, { patch: true }));
      expect(Object.keys(data)).to.eql(['meta.b']);
      expect(data['meta.b'][0].keyword).to.equal('type');
    });

    it('should not fail on nested required properties of untouched siblings', () => {
      expect(() => {
        TestModel.fromJson({ 'meta:nested.y': 1, 'meta:b': 'foo' }, { patch: true });
      }).to.not.throwException();
    });

    it('should validate multiple field expression keys of the same column', () => {
      expect(() => {
        TestModel.fromJson(
          { name: 'foo', 'meta:a': 'a', 'meta:b': 'b', 'meta:nested.x': 1 },
          { patch: true },
        );
      }).to.not.throwException();

      const data = validationErrorData(() =>
        TestModel.fromJson({ 'meta:a': 1, 'meta:nested.x': 'x' }, { patch: true }),
      );
      expect(Object.keys(data).sort()).to.eql(['meta.a', 'meta.nested.x']);
    });

    it('should report additional properties inside the json column', () => {
      const data = validationErrorData(() =>
        TestModel.fromJson({ 'meta:c': 'foo' }, { patch: true }),
      );
      expect(Object.keys(data)).to.eql(['meta.c']);
      expect(data['meta.c'][0].keyword).to.equal('additionalProperties');
    });

    it('should report unknown columns of field expression keys', () => {
      const data = validationErrorData(() =>
        TestModel.fromJson({ 'unknown:b': 'foo' }, { patch: true }),
      );
      expect(Object.keys(data)).to.eql(['unknown']);
      expect(data.unknown[0].keyword).to.equal('additionalProperties');
    });

    it('should support table prefixes in field expression keys', () => {
      expect(() => {
        TestModel.fromJson({ 'test.meta:b': 'foo' }, { patch: true });
      }).to.not.throwException();
    });

    it('should not validate field expression keys with array access', () => {
      expect(() => {
        TestModel.fromJson({ 'tags:[0]': 'foo', 'meta:nested[0]': 1 }, { patch: true });
      }).to.not.throwException();
    });

    it('should not modify the input json', () => {
      const json = { name: 'foo', 'meta:b': 'foo' };
      const model = TestModel.fromJson(json, { patch: true });
      expect(json).to.eql({ name: 'foo', 'meta:b': 'foo' });
      expect(model).to.eql({ name: 'foo', 'meta:b': 'foo' });
    });

    it('should apply type coercion to field expression values', () => {
      const CoercingModel = createModelClass({ coerceTypes: true });
      const model = CoercingModel.fromJson({ 'meta:b': 1, 'meta:nested.x': '2' }, { patch: true });
      expect(model['meta:b']).to.equal('1');
      expect(model['meta:nested.x']).to.equal(2);
    });

    it('should apply removeAdditional to field expression keys', () => {
      const RemovingModel = createModelClass({ removeAdditional: 'all' });
      const model = RemovingModel.fromJson(
        { 'meta:b': 'foo', 'meta:c': 'bar', 'unknown:a': 1 },
        { patch: true },
      );
      expect(model).to.eql({ 'meta:b': 'foo' });
    });

    it('should not change the validation of field expression keys in non-patch mode', () => {
      const data = validationErrorData(() => TestModel.fromJson({ name: 'foo', 'meta:b': 'foo' }));
      expect(Object.keys(data)).to.eql(['meta:b']);
    });
  });
});
