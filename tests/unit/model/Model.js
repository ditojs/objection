import { describe, it, expect, beforeEach } from 'vitest';
import { Model, QueryBuilder, ValidationError, raw, fn } from 'objection';
import { snakeCase, camelCase } from '../../../lib/utils/identifierMapping.js';
import { expectThrows, range, sortBy } from '../../../testUtils/testUtils.js';

describe('Model', () => {
  describe('fromJson', () => {
    let Model1;

    beforeEach(() => {
      Model1 = modelClass('Model1');
    });

    it('should copy attributes to the created object', () => {
      let json = { a: 1, b: 2, c: { d: 'str1' }, e: [3, 4, { f: 'str2' }] };
      let model = Model1.fromJson(json);

      expect(model.a).toBe(1);
      expect(model.b).toBe(2);
      expect(model.c.d).toBe('str1');
      expect(model.e[0]).toBe(3);
      expect(model.e[1]).toBe(4);
      expect(model.e[2].f).toBe('str2');
    });

    it('should skip properties starting with $', () => {
      let model = Model1.fromJson({ a: 1, $b: 2 });

      expect(model.a).toBe(1);
      expect(model).not.toHaveProperty('$b');
    });

    it('should skip functions', () => {
      let model = Model1.fromJson({ a: 1, b: () => {} });

      expect(model.a).toBe(1);
      expect(model).not.toHaveProperty('b');
    });

    it('should call $parseJson', () => {
      let calls = 0;
      let json = { a: 1 };
      let options = { b: 2 };

      Model1.prototype.$parseJson = function (jsn, opt) {
        ++calls;
        expect(jsn).toEqual(json);
        expect(opt).toEqual(options);
        return { c: 3 };
      };

      let model = Model1.fromJson(json, options);

      expect(model).not.toHaveProperty('a');
      expect(model.c).toBe(3);
      expect(calls).toBe(1);
    });

    it('should validate if jsonSchema is defined', () => {
      Model1.jsonSchema = {
        type: 'object',
        required: ['a'],
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
          c: {
            type: 'object',
            properties: {
              d: { type: 'string' },
              e: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    f: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      };

      expect(() => {
        Model1.fromJson({ a: 'str', b: 1 });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'str' });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'a', c: { d: 'test' } });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'a', c: { d: 'test', e: [{ f: 1 }] } });
      }).not.toThrow();

      expectThrows(
        () => {
          Model1.fromJson({ a: 1, b: '1' });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty('a');
          expect(exp.data).toHaveProperty('b');
        },
      );

      expectThrows(
        () => {
          Model1.fromJson({ b: 1 });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty('a');
        },
      );

      expectThrows(
        () => {
          Model1.fromJson({ a: 'a', additional: 1 });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty('additional');
        },
      );

      expectThrows(
        () => {
          Model1.fromJson({ a: 'a', c: { d: 10 } });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty(['c.d']);
        },
      );

      expectThrows(
        () => {
          Model1.fromJson({ a: 'a', c: { d: 'test', e: [{ f: 'not a number' }] } });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty(['c.e.0.f']);
        },
      );

      expectThrows(
        () => {
          Model1.fromJson({ a: 'a', c: { d: 'test', e: [{ additional: true }] } });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty(['c.e.0.additional']);
        },
      );
    });

    it('should call $validate if jsonSchema is defined', () => {
      let calls = 0;
      let json = { a: 'str', b: 2 };
      let options = { some: 'option' };

      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      };

      Model1.prototype.$validate = function (jsn, opt) {
        Model.prototype.$validate.call(this, jsn, opt);

        ++calls;
        expect(opt).toEqual(options);
        expect(jsn).toEqual(json);
      };

      expect(() => {
        Model1.fromJson(json, options);
      }).not.toThrow();

      expect(calls).toBe(1);
    });

    it('should only call jsonSchema once if jsonSchema is a getter', () => {
      let calls = 0;

      Object.defineProperty(Model1, 'jsonSchema', {
        get: () => {
          ++calls;
          return {
            required: ['a'],
            properties: {
              a: { type: 'string' },
              b: { type: 'number' },
            },
          };
        },
      });

      for (let i = 0; i < 10; ++i) {
        Model1.fromJson({ a: 'str', b: 2 });
      }

      let model = Model1.fromJson({ a: 'str', b: 2 });
      model.$validate();
      model.$validate();
      model.$toJson();
      model.$toDatabaseJson();

      expect(calls).toBe(1);
    });

    it('should call $beforeValidate if jsonSchema is defined', () => {
      let calls = 0;
      let json = { a: 1, b: 2 };
      let options = { some: 'option' };

      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      };

      Model1.prototype.$beforeValidate = function (schema, jsn, opt) {
        ++calls;

        expect(opt).toEqual(options);
        expect(jsn).toEqual(json);
        expect(schema).toEqual(Model1.jsonSchema);

        schema.properties.a.type = 'number';
        return schema;
      };

      expect(() => {
        Model1.fromJson(json, options);
      }).not.toThrow();

      expect(calls).toBe(1);
    });

    it('should call $afterValidate if jsonSchema is defined', () => {
      let calls = 0;
      let json = { a: 'str', b: 2 };
      let options = { some: 'option' };

      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      };

      Model1.prototype.$afterValidate = function (jsn, opt) {
        ++calls;
        expect(opt).toEqual(options);
        expect(jsn).toEqual(json);
      };

      expect(() => {
        Model1.fromJson(json, options);
      }).not.toThrow();

      expect(calls).toBe(1);
    });

    it('should skip requirement validation if options.patch == true', () => {
      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      };

      expect(() => {
        Model1.fromJson({ a: 'str', b: 1 }, { patch: true });
      }).not.toThrow();

      // b is not required.
      expect(() => {
        Model1.fromJson({ a: 'str' }, { patch: true });
      }).not.toThrow();

      expectThrows(
        () => {
          Model1.fromJson({ a: 1, b: '1' }, { patch: true });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty('a');
          expect(exp.data).toHaveProperty('b');
        },
      );

      expect(() => {
        Model1.fromJson({ b: 1 }, { patch: true });
      }).not.toThrow();
    });

    it('should skip requirement validation if options.patch == true (oneOf)', () => {
      Model1.jsonSchema = {
        oneOf: [
          {
            required: ['a'],
          },
          {
            required: ['b'],
          },
        ],

        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
          c: { type: 'string' },
        },
      };

      expect(() => {
        Model1.fromJson({ c: 'str' });
      }).toThrow();

      expect(() => {
        Model1.fromJson({ a: 'str' });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ b: 1 });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ c: 'str' }, { patch: true });
      }).not.toThrow();
    });

    it('should skip requirement validation if options.patch == true (anyOf)', () => {
      Model1.jsonSchema = {
        anyOf: [
          {
            required: ['a'],
          },
          {
            required: ['b'],
          },
        ],

        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
          c: { type: 'string' },
        },
      };

      expect(() => {
        Model1.fromJson({ c: 'str' });
      }).toThrow();

      expect(() => {
        Model1.fromJson({ a: 'str' });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ b: 1 });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ c: 'str' }, { patch: true });
      }).not.toThrow();
    });

    it('should skip requirement validation if options.patch == true (if/then)', () => {
      Model1.jsonSchema = {
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
          c: { type: 'string' },
        },

        if: {
          properties: {
            a: {
              enum: ['foo'],
            },
          },
        },
        then: {
          required: ['b'],
        },
        else: {
          required: ['c'],
        },
      };

      expect(() => {
        Model1.fromJson({ a: 'foo' });
      }).toThrow();

      expect(() => {
        Model1.fromJson({ a: 'bar' });
      }).toThrow();

      expect(() => {
        Model1.fromJson({ a: 'foo', b: 1 });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'bar', c: 'baz' });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'foo' }, { patch: true });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'bar' }, { patch: true });
      }).not.toThrow();
    });

    it('should skip validation if options.skipValidation == true', () => {
      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      };

      expect(() => {
        Model1.fromJson({ a: 'str', b: 1 }, { skipValidation: true });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 'str' }, { skipValidation: true });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ a: 1, b: '1' }, { skipValidation: true });
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({ b: 1 }, { skipValidation: true });
      }).not.toThrow();
    });

    it('should merge default values from jsonSchema', () => {
      let obj = { a: 100, b: 200 };

      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string', default: 'default string' },
          b: { type: 'number', default: 666 },
          c: { type: 'object', default: obj },
        },
      };

      let model = Model1.fromJson({ a: 'str' });

      expect(model.a).toBe('str');
      expect(model.b).toBe(666);
      expect(model.c).toEqual(obj);
      expect(model.c).not.toBe(obj);
    });

    it('should merge default values from jsonSchema when validating a model instance', () => {
      let obj = { a: 100, b: 200 };

      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string', default: 'default string' },
          b: { type: 'number', default: 666 },
          c: { type: 'object', default: obj },
        },
      };

      let model = Model1.fromJson({ a: 'str' }, { skipValidation: true });

      expect(model.b).toBeUndefined();
      expect(model.c).toBeUndefined();

      model.$validate();

      expect(model.a).toBe('str');
      expect(model.b).toBe(666);
      expect(model.c).toEqual(obj);
      expect(model.c).not.toBe(obj);
    });

    // regression introduced in 0.6
    // https://github.com/Vincit/objection.js/issues/205
    it('should not throw TypeError when jsonSchema.properties == undefined', () => {
      Model1.jsonSchema = {
        required: ['a'],
      };

      let model = Model1.fromJson({ a: 100 });

      expect(model.a).toBe(100);
    });

    it('should validate but not pass if jsonSchema.required exists and jsonSchema.properties == undefined', () => {
      Model1.jsonSchema = {
        required: ['a'],
      };

      expect(() => {
        Model1.fromJson({ b: 200 });
      }).toThrow(ValidationError);
    });

    it('should not merge default values from jsonSchema if options.patch == true', () => {
      let obj = { a: 100, b: 200 };

      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'string', default: 'default string' },
          b: { type: 'number', default: 666 },
          c: { type: 'object', default: obj },
        },
      };

      let model = Model1.fromJson({ b: 10 }, { patch: true });

      expect(model).not.toHaveProperty('a');
      expect(model.b).toBe(10);
      expect(model).not.toHaveProperty('c');
    });

    it('should throw with error context if validation fails', () => {
      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: { type: 'number' },
          b: { type: 'string', minLength: 4 },
        },
      };

      expectThrows(
        () => {
          Model1.fromJson({ b: 'abc' });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty('a');
          expect(exp.data['a']).toBeInstanceOf(Array);
          expect(exp.data['a'].length).toBeGreaterThan(0);
          expect(exp.data['a'][0]).toHaveProperty('message');
          expect(exp.data['a'][0]).toHaveProperty('keyword');
          expect(exp.data['a'][0]).toHaveProperty('params');
          expect(exp.data['a'][0].keyword).toBe('required');
          expect(exp.data).toHaveProperty('b');
          expect(exp.data['b']).toBeInstanceOf(Array);
          expect(exp.data['b'].length).toBeGreaterThan(0);
          expect(exp.data['b'][0]).toHaveProperty('message');
          expect(exp.data['b'][0]).toHaveProperty('keyword');
          expect(exp.data['b'][0]).toHaveProperty('params');
          expect(exp.data['b'][0].keyword).toBe('minLength');
          expect(exp.data['b'][0].params).toHaveProperty('limit');
          expect(exp.data['b'][0].params.limit).toBe(4);
        },
      );
    });

    it('should throw if anything non-object is given', () => {
      function SomeClass() {}

      expect(() => {
        Model1.fromJson();
      }).not.toThrow();

      expect(() => {
        Model1.fromJson(null);
      }).not.toThrow();

      expect(() => {
        Model1.fromJson(undefined);
      }).not.toThrow();

      expect(() => {
        Model1.fromJson({});
      }).not.toThrow();

      expect(() => {
        Model1.fromJson(new SomeClass());
      }).not.toThrow();

      expect(() => {
        Model1.fromJson('hello');
      }).toThrow();

      expect(() => {
        Model1.fromJson(new String('hello'));
      }).toThrow();

      expect(() => {
        Model1.fromJson(1);
      }).toThrow();

      expect(() => {
        Model1.fromJson(new Number(1));
      }).toThrow();

      expect(() => {
        Model1.fromJson([{ a: 1 }]);
      }).toThrow();

      expect(() => {
        Model1.fromJson(/.*/);
      }).toThrow();

      expect(() => {
        Model1.fromJson(new Date());
      }).toThrow();

      expect(() => {
        Model1.fromJson(() => {});
      }).toThrow();

      expect(() => {
        Model1.fromJson(new Int16Array(100));
      }).toThrow();
    });

    it('should be capable to return multiple validation errors per property', () => {
      Model1.jsonSchema = {
        required: ['a'],
        properties: {
          a: {
            type: 'string',
            minLength: 5,
            pattern: '^\\d+$',
          },
        },
      };

      expectThrows(
        () => {
          Model1.fromJson({ a: 'four' });
        },
        (exp) => {
          expect(exp).toBeInstanceOf(ValidationError);
          expect(exp.data).toHaveProperty('a');
          expect(exp.data['a']).toBeInstanceOf(Array);
          expect(exp.data['a']).toHaveLength(2);
          expect(exp.data['a'][0]).toHaveProperty('message');
          expect(exp.data['a'][0]).toHaveProperty('keyword');
          expect(exp.data['a'][0]).toHaveProperty('params');
          expect(exp.data['a'][0].keyword).toBe('pattern');
          expect(exp.data['a'][1]).toHaveProperty('message');
          expect(exp.data['a'][1]).toHaveProperty('keyword');
          expect(exp.data['a'][1]).toHaveProperty('params');
          expect(exp.data['a'][1].keyword).toBe('minLength');
        },
      );
    });

    it('should parse relations into Model instances and remove them from database representation', () => {
      let Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };

      let model = Model1.fromJson({
        id: 10,
        model1Id: 13,
        relation1: [
          { id: 11, model1Id: 10 },
          { id: 12, model1Id: 10 },
        ],
        relation2: { id: 13, model1Id: null },
      });

      expect(model.relation1[0]).toBeInstanceOf(Model2);
      expect(model.relation1[1]).toBeInstanceOf(Model2);
      expect(model.relation2).toBeInstanceOf(Model1);

      let json = model.$toDatabaseJson();

      expect(json).not.toHaveProperty('relation1');
      expect(json).not.toHaveProperty('relation2');

      json = model.$toJson();

      expect(json).toHaveProperty('relation1');
      expect(json).toHaveProperty('relation2');
    });

    it('should parse relations into Model instances if source that is being parsed is already a Model instance', () => {
      let Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };

      let model = Model1.fromJson({
        id: 10,
        model1Id: 13,
      });
      model.relation1 = [
        { id: 11, model1Id: 10 },
        { id: 12, model1Id: 10 },
      ];
      model.relation2 = { id: 13, model1Id: null };

      let modelWithRelationships = Model1.fromJson(model);

      expect(modelWithRelationships.relation1[0]).toBeInstanceOf(Model2);
      expect(modelWithRelationships.relation1[1]).toBeInstanceOf(Model2);
      expect(modelWithRelationships.relation2).toBeInstanceOf(Model1);
    });

    it('should NOT parse relations into Model instances if skipParseRelations option is given', () => {
      let Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };

      let model = Model1.fromJson(
        {
          id: 10,
          model1Id: 13,
          relation1: [
            { id: 11, model1Id: 10 },
            { id: 12, model1Id: 10 },
          ],
          relation2: { id: 13, model1Id: null },
        },
        { skipParseRelations: true },
      );

      expect(model.relation1[0]).not.toBeInstanceOf(Model2);
      expect(model.relation1[1]).not.toBeInstanceOf(Model2);
      expect(model.relation2).not.toBeInstanceOf(Model1);
    });

    it('should NOT try to parse non-object relations into Model instances', () => {
      let Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };

      let model = Model1.fromJson(
        {
          id: 10,
          model1Id: 13,
          relation1: [1, 2, '3', null, undefined, 6],
          relation2: '5',
        },
        { skipParseRelations: true },
      );

      expect(model.relation1).toEqual([1, 2, '3', null, undefined, 6]);
      expect(model.relation2).toBe('5');
    });

    it('null relations should be null in the result', () => {
      let Model = modelClass('Model');

      Model.relationMappings = {
        someRelation: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model,
          join: {
            from: 'Model.id',
            to: 'Model.model1Id',
          },
        },
      };

      let model = Model.fromJson({ a: 1, b: 2, someRelation: null });
      expect(model.someRelation).toBeNull();
    });
  });

  describe('ensureModel', () => {
    let Model1;
    let Model2;

    beforeEach(() => {
      Model1 = modelClass('Model1');
      Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },

        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };
    });

    it('should parse nested relations into model instances even if the root is a model', () => {
      let model1 = Model1.fromJson({
        id: 10,
        model1Id: 13,
      });

      model1.relation1 = [{ value: 1 }, { value: 2 }];
      model1.relation2 = { value: 3, relation1: [{ value: 4 }] };

      let model2 = Model1.ensureModel(model1);

      expect(model2 === model1).toBe(true);
      expect(model2.relation1[0]).toBeInstanceOf(Model2);
      expect(model2.relation1[1]).toBeInstanceOf(Model2);
      expect(model2.relation2).toBeInstanceOf(Model1);
      expect(model2.relation2.relation1[0]).toBeInstanceOf(Model2);
    });

    it('should not mutate if the whole tree already is models', () => {
      let model1 = Model1.fromJson({
        id: 10,
        model1Id: 13,
        relation1: [{ value: 1 }, { value: 2 }],
        relation2: { value: 3, relation1: [{ value: 4 }] },
      });

      let model2 = Model1.ensureModel(model1);

      expect(model2 === model1).toBe(true);
      expect(model2.relation1 === model2.relation1).toBe(true);
      expect(model2.relation1[0] === model2.relation1[0]).toBe(true);
      expect(model2.relation1[1] === model2.relation1[1]).toBe(true);
      expect(model2.relation2 === model2.relation2).toBe(true);
      expect(model2.relation2.relation1[0] === model2.relation2.relation1[0]).toBe(true);
    });

    it('should work with circular references', () => {
      let obj1 = { value: 1 };
      let obj2 = { value: 2 };

      obj1.relation2 = obj2;
      obj2.relation2 = obj1;

      const model = Model1.ensureModel(obj1);
      expect(model).toBeInstanceOf(Model1);
      expect(model.relation2).toBeInstanceOf(Model1);
      expect(model.relation2.relation2 === model).toBe(true);
      expect(model.value).toBe(1);
      expect(model.relation2.value).toBe(2);
    });
  });

  describe('fromDatabaseJson', () => {
    let Model1;

    beforeEach(() => {
      Model1 = createModelClass();
    });

    it('should copy attributes to the created object', () => {
      let json = { a: 1, b: 2, c: { d: 'str1' }, e: [3, 4, { f: 'str2' }] };
      let model = Model1.fromDatabaseJson(json);

      expect(model.a).toBe(1);
      expect(model.b).toBe(2);
      expect(model.c.d).toBe('str1');
      expect(model.e[0]).toBe(3);
      expect(model.e[1]).toBe(4);
      expect(model.e[2].f).toBe('str2');
    });

    it('should call $parseDatabaseJson', () => {
      let calls = 0;
      let json = { a: 1 };

      Model1.prototype.$parseDatabaseJson = (jsn) => {
        ++calls;
        expect(jsn).toEqual(json);
        return { c: 3 };
      };

      let model = Model1.fromDatabaseJson(json);

      expect(model).not.toHaveProperty('a');
      expect(model.c).toBe(3);
      expect(calls).toBe(1);
    });
  });

  describe('$toJson', () => {
    let Model1;

    beforeEach(() => {
      Model1 = createModelClass();
    });

    it('should return the internal representation by default', () => {
      expect(Model1.fromJson({ a: 1, b: 2, c: { d: [1, 3] } }).$toJson()).toEqual({
        a: 1,
        b: 2,
        c: { d: [1, 3] },
      });
    });

    it('should call $formatJson', () => {
      let calls = 0;
      let json = { a: 1 };

      Model1.prototype.$formatJson = (jsn) => {
        ++calls;
        expect(jsn).toEqual(json);
        jsn.b = 2;
        return jsn;
      };

      let model = Model1.fromJson(json);
      let output = model.$toJson();

      expect(output.a).toBe(1);
      expect(output.b).toBe(2);
      expect(calls).toBe(1);
    });

    it('should call $formatJson with formatting options', () => {
      let calls = 0;
      let json = { a: 1 };
      let opt = { c: 2 };

      Model1.prototype.$formatJson = (jsn, o) => {
        ++calls;
        expect(jsn).toEqual(json);
        expect(o).toEqual(opt);
        jsn.b = 2;
        return jsn;
      };

      let model = Model1.fromJson(json);
      let output = model.$toJson({ format: opt });

      expect(output.a).toBe(1);
      expect(output.b).toBe(2);
      expect(calls).toBe(1);
    });

    it('should call $toJson for properties of class Model', () => {
      let Model2 = createModelClass();

      Model2.prototype.$formatJson = (jsn) => {
        jsn.d = 3;
        return jsn;
      };

      let model = Model1.fromJson({ a: 1 });
      model.b = Model2.fromJson({ c: 2 });
      model.e = [Model2.fromJson({ f: 100 })];

      expect(model.$toJson()).toEqual({ a: 1, b: { c: 2, d: 3 }, e: [{ f: 100, d: 3 }] });
    });

    it('should pass formatting options to $formatJson of nested models', () => {
      let Model2 = createModelClass();
      let opt = { d: 3 };

      Model1.prototype.$formatJson = Model2.prototype.$formatJson = (jsn, o) => {
        jsn.d = o && o.d;
        return jsn;
      };

      let model = Model1.fromJson({ a: 1 });
      model.b = Model2.fromJson({ c: 2 });
      model.e = [Model2.fromJson({ f: 100 })];

      expect(model.$toJson({ format: opt })).toEqual({
        a: 1,
        d: 3,
        b: { c: 2, d: 3 },
        e: [{ f: 100, d: 3 }],
      });
    });

    it('should return a deep copy', () => {
      let json = { a: 1, b: [{ c: 2 }], d: { e: 'str' } };
      let model = Model1.fromJson(json);
      let output = model.$toJson();

      expect(output).toEqual(json);
      expect(output.b).not.toBe(json.b);
      expect(output.b[0]).not.toBe(json.b[0]);
      expect(output.d).not.toBe(json.d);
    });

    it('should be called by JSON.stringify', () => {
      Model1.prototype.$formatJson = (jsn) => {
        jsn.b = 2;
        return jsn;
      };

      let model = Model1.fromJson({ a: 1 });
      expect(JSON.stringify(model)).toBe('{"a":1,"b":2}');
    });

    it('properties registered using $omitFromJson method should be removed from the json', () => {
      let model = Model1.fromJson({ a: 1, b: 2, c: 3 });
      model.$omitFromJson(['b', 'c']);
      expect(model.$toJson()).toEqual({ a: 1 });
      expect(model).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('properties registered using $omitFromJson method should be removed from the json (multiple calls)', () => {
      let model = Model1.fromJson({ a: 1, b: 2, c: 3 });
      model.$omitFromJson(['b']);
      model.$omitFromJson(['c']);
      model.$omitFromDatabaseJson(['a']);
      expect(model.$toJson()).toEqual({ a: 1 });
      expect(model).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('$toDatabaseJson', () => {
    let Model1;

    beforeEach(() => {
      Model1 = createModelClass();
    });

    it('should return then internal representation by default', () => {
      expect(Model1.fromJson({ a: 1, b: 2, c: { d: [1, 3] } }).$toDatabaseJson()).toEqual({
        a: 1,
        b: 2,
        c: { d: [1, 3] },
      });
    });

    it('should format JSON attributes of all kinds', () => {
      Model1.jsonAttributes = ['a', 'b', 'c', 'd', 'e', 'f'];
      expect(
        Model1.fromJson({
          a: 1,
          b: 'one',
          c: { d: [1, 3] },
          d: [1, 2, 3],
          e: null,
          f: undefined,

          g: 1,
          h: 'one',
          i: { d: [1, 3] },
          j: [1, 2, 3],
          k: null,
          l: undefined,
        }).$toDatabaseJson(),
      ).toEqual({
        a: '1',
        b: '"one"',
        c: '{"d":[1,3]}',
        d: '[1,2,3]',
        e: null,

        g: 1,
        h: 'one',
        i: { d: [1, 3] },
        j: [1, 2, 3],
        k: null,
      });
      Model1.jsonAttributes = [];
    });

    it('should call $formatDatabaseJson', () => {
      let calls = 0;
      let json = { a: 1 };

      Model1.prototype.$formatDatabaseJson = (jsn) => {
        ++calls;
        expect(jsn).toEqual(json);
        jsn.b = 2;
        return jsn;
      };

      let model = Model1.fromJson(json);
      let output = model.$toDatabaseJson();

      expect(output.a).toBe(1);
      expect(output.b).toBe(2);
      expect(calls).toBe(1);
    });

    it('should return a deep copy', () => {
      let json = { a: 1, b: [{ c: 2 }], d: { e: 'str' } };
      let model = Model1.fromJson(json);
      let output = model.$toDatabaseJson();

      expect(output).toEqual(json);
      expect(output.b).not.toBe(json.b);
      expect(output.b[0]).not.toBe(json.b[0]);
      expect(output.d).not.toBe(json.d);
    });

    it('properties registered using $omitFromDatabaseJson method should be removed from the json', () => {
      let model = Model1.fromJson({ a: 1, b: 2, c: 3 });
      model.$omitFromDatabaseJson(['b', 'c']);
      expect(model.$toDatabaseJson()).toEqual({ a: 1 });
      expect(model).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('properties registered using $omitFromDatabaseJson method should be removed from the json (multiple calls)', () => {
      let model = Model1.fromJson({ a: 1, b: 2, c: 3 });
      model.$omitFromDatabaseJson(['b']);
      model.$omitFromDatabaseJson(['c']);
      model.$omitFromJson(['a']);
      expect(model.$toDatabaseJson()).toEqual({ a: 1 });
      expect(model).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('$clone', () => {
    let Model1;

    beforeEach(() => {
      Model1 = createModelClass();
    });

    it('should clone', () => {
      let Model2 = createModelClass();

      Model2.prototype.$formatJson = (jsn) => {
        jsn.d = 3;
        return jsn;
      };

      let model = Model1.fromJson({ a: 1, g: { h: 100 }, r: [{ h: 50 }] });
      model.b = Model2.fromJson({ c: 2 });
      model.e = [Model2.fromJson({ f: 100 })];

      let clone = model.$clone();

      expect(clone).toEqual(model);
      expect(clone.$toJson()).toEqual(model.$toJson());
      expect(clone.$toJson()).toEqual({
        a: 1,
        g: { h: 100 },
        r: [{ h: 50 }],
        b: { c: 2, d: 3 },
        e: [{ f: 100, d: 3 }],
      });

      expect(clone.g).not.toBe(model.g);
      expect(clone.r[0]).not.toBe(model.r[0]);
      expect(clone.b).not.toBe(model.b);
      expect(clone.e[0]).not.toBe(model.e[0]);
    });

    it('should shallow clone', () => {
      let Model = modelClass('Model');

      Model.relationMappings = {
        someRelation: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model,
          join: {
            from: 'Model.id',
            to: 'Model.model1Id',
          },
        },
      };

      let model = Model.fromJson({ a: 1, b: 2, someRelation: { a: 3, b: 4 } });

      expect(model.$clone()).toEqual({ a: 1, b: 2, someRelation: { a: 3, b: 4 } });
      expect(model.$clone({ shallow: true })).toEqual({ a: 1, b: 2 });
    });
  });

  describe('propertyNameToColumnName', () => {
    let Model1;

    beforeEach(() => {
      Model1 = createModelClass({
        $formatDatabaseJson: (json) => {
          return Object.fromEntries(
            Object.entries(json).map(([key, value]) => {
              return [snakeCase(key), value];
            }),
          );
        },
      });
    });

    it('should convert a property name to column name', () => {
      expect(Model1.propertyNameToColumnName('someProperty')).toBe('some_property');
    });
  });

  describe('columnNameToPropertyName', () => {
    let Model1;

    beforeEach(() => {
      Model1 = createModelClass({
        $parseDatabaseJson: (json) => {
          return Object.fromEntries(
            Object.entries(json).map(([key, value]) => {
              return [camelCase(key), value];
            }),
          );
        },
      });
    });

    it('should convert a column name to property name', () => {
      expect(Model1.columnNameToPropertyName('some_property')).toBe('someProperty');
    });
  });

  describe('virtualAttributes', () => {
    it('should include getters', () => {
      class Model1 extends Model {
        get foo() {
          return this.a + this.b;
        }

        get bar() {
          return this.a + this.b;
        }

        static get virtualAttributes() {
          return ['foo'];
        }
      }

      expect(
        Model1.fromJson({
          a: 100,
          b: 10,
          rel1: Model1.fromJson({ a: 101, b: 11 }),
          rel2: [Model1.fromJson({ a: 102, b: 12 }), Model1.fromJson({ a: 103, b: 13 })],
        }).toJSON(),
      ).toEqual({
        a: 100,
        b: 10,
        foo: 110,

        rel1: {
          a: 101,
          b: 11,
          foo: 112,
        },

        rel2: [
          { a: 102, b: 12, foo: 114 },
          { a: 103, b: 13, foo: 116 },
        ],
      });
    });

    it('should ignore virtuals when virtuals: false option is passed to toJSON', () => {
      class Model1 extends Model {
        get foo() {
          return this.a + this.b;
        }

        get bar() {
          return this.a + this.b;
        }

        static get virtualAttributes() {
          return ['foo'];
        }
      }

      expect(
        Model1.fromJson({
          a: 100,
          b: 10,
          rel1: Model1.fromJson({ a: 101, b: 11 }),
          rel2: [Model1.fromJson({ a: 102, b: 12 }), Model1.fromJson({ a: 103, b: 13 })],
        }).toJSON({ virtuals: false }),
      ).toEqual({
        a: 100,
        b: 10,

        rel1: {
          a: 101,
          b: 11,
        },

        rel2: [
          { a: 102, b: 12 },
          { a: 103, b: 13 },
        ],
      });
    });

    it('should ignore virtuals when virtuals: false option is passed to $toJson', () => {
      class Model1 extends Model {
        get foo() {
          return this.a + this.b;
        }

        get bar() {
          return this.a + this.b;
        }

        static get virtualAttributes() {
          return ['foo'];
        }
      }

      expect(
        Model1.fromJson({
          a: 100,
          b: 10,
          rel1: Model1.fromJson({ a: 101, b: 11 }),
          rel2: [Model1.fromJson({ a: 102, b: 12 }), Model1.fromJson({ a: 103, b: 13 })],
        }).$toJson({ virtuals: false }),
      ).toEqual({
        a: 100,
        b: 10,

        rel1: {
          a: 101,
          b: 11,
        },

        rel2: [
          { a: 102, b: 12 },
          { a: 103, b: 13 },
        ],
      });
    });

    it('should pick a set of virtuals if array is passed to in `virtuals` option', () => {
      class Model1 extends Model {
        get foo() {
          return this.a + this.b;
        }

        get bar() {
          return this.a * this.b;
        }

        static get virtualAttributes() {
          return ['foo'];
        }
      }

      expect(
        Model1.fromJson({
          a: 100,
          b: 10,
          rel1: Model1.fromJson({ a: 101, b: 11 }),
          rel2: [Model1.fromJson({ a: 102, b: 12 }), Model1.fromJson({ a: 103, b: 13 })],
        }).$toJson({ virtuals: ['foo', 'bar'] }),
      ).toEqual({
        a: 100,
        b: 10,
        foo: 110,
        bar: 1000,

        rel1: {
          a: 101,
          b: 11,
          foo: 112,
          bar: 1111,
        },

        rel2: [
          { a: 102, b: 12, foo: 114, bar: 1224 },
          { a: 103, b: 13, foo: 116, bar: 1339 },
        ],
      });
    });

    it('should include virtualAttributes for related models', () => {
      class Model1 extends modelClass('Model1') {
        static get virtualAttributes() {
          return ['foo'];
        }

        get foo() {
          return 'foo';
        }
      }

      class Model2 extends modelClass('Model2') {
        static get virtualAttributes() {
          return ['bar'];
        }

        static get relationMappings() {
          return {
            model1: {
              relation: Model.BelongsToOneRelation,
              modelClass: Model1,
              join: {
                from: 'Model2.model1Id',
                to: 'Model1.id',
              },
            },
          };
        }

        get bar() {
          return 'bar';
        }
      }

      let model2 = Model2.fromJson({
        a: 'a',
        model1: {
          b: 'b',
          c: 'c',
        },
      });

      expect(model2.toJSON()).toEqual({
        a: 'a',
        bar: 'bar',
        model1: {
          b: 'b',
          c: 'c',
          foo: 'foo',
        },
      });
    });

    it('should default to virtuals = true even when an options object with no `virtuals` property is passed', () => {
      class Model1 extends modelClass('Model1') {
        static get virtualAttributes() {
          return ['foo'];
        }

        get foo() {
          return 'foo';
        }
      }

      class Model2 extends modelClass('Model2') {
        static get virtualAttributes() {
          return ['bar'];
        }

        static get relationMappings() {
          return {
            model1: {
              relation: Model.BelongsToOneRelation,
              modelClass: Model1,
              join: {
                from: 'Model2.model1Id',
                to: 'Model1.id',
              },
            },
          };
        }

        get bar() {
          return 'bar';
        }
      }

      let model2 = Model2.fromJson({
        a: 'a',
        model1: {
          b: 'b',
          c: 'c',
        },
      });

      expect(model2.toJSON({})).toEqual({
        a: 'a',
        bar: 'bar',
        model1: {
          b: 'b',
          c: 'c',
          foo: 'foo',
        },
      });
    });

    it('should include methods', () => {
      class Model1 extends Model {
        foo() {
          return this.a + this.b;
        }

        bar() {
          return this.a + this.b;
        }

        static get virtualAttributes() {
          return ['foo'];
        }
      }

      expect(Model1.fromJson({ a: 100, b: 10 }).toJSON()).toEqual({
        a: 100,
        b: 10,
        foo: 110,
      });
    });

    it('should not try to set readonly properties', () => {
      class Model1 extends Model {
        get foo() {
          return this.a + this.b;
        }

        // Should ignore all getter-only properties. Not only virtual.
        get notEvenVirtual() {
          return 'imNotVirtual';
        }

        get bar() {
          return this.c;
        }

        set bar(c) {
          this.c = c;
        }

        baz() {
          return 2 * this.a;
        }

        static get virtualAttributes() {
          return ['foo', 'bar', 'baz'];
        }
      }

      const model = Model1.fromJson({
        a: 10,
        b: 100,
        bar: 1000,
        foo: 200,
        baz: 300,
        notEvenVirtual: 2000,
      });

      expect(model.toJSON()).toEqual({
        a: 10,
        b: 100,
        c: 1000,
        foo: 110,
        bar: 1000,
        baz: 20,
      });

      expect(model.$toDatabaseJson()).toEqual({
        a: 10,
        b: 100,
        c: 1000,
      });
    });

    it('should not try to set readonly properties from super classes', () => {
      class BaseModel extends Model {
        static get virtualAttributes() {
          return ['foo'];
        }

        get foo() {
          return this.a + this.b;
        }
      }

      class Model1 extends BaseModel {}

      expect(Model1.fromJson({ a: 100, b: 10, foo: 666 }).toJSON()).toEqual({
        a: 100,
        b: 10,
        foo: 110,
      });

      expect(Model1.fromJson({ a: 100, b: 10, foo: 666 }).$toDatabaseJson()).toEqual({
        a: 100,
        b: 10,
      });
    });
  });

  describe('cloneObjectAttributes', () => {
    it('should clone object attributes by default when calling $toJson or $toDatabaseJson', () => {
      class Person extends Model {}

      const obj = {
        foo: {
          bar: 1,
        },
      };

      const person = Person.fromDatabaseJson({
        objectField: obj,
      });

      expect(person.objectField).toBe(obj);

      let json = person.$toDatabaseJson();

      expect(person.objectField).toBe(obj);
      expect(json.objectField).toEqual(obj);
      expect(json.objectField).not.toBe(obj);

      json = person.$toJson();

      expect(person.objectField).toBe(obj);
      expect(json.objectField).toEqual(obj);
      expect(json.objectField).not.toBe(obj);

      json = person.toJSON();

      expect(person.objectField).toBe(obj);
      expect(json.objectField).toEqual(obj);
      expect(json.objectField).not.toBe(obj);
    });

    it('should NOT clone object attributes when calling $toJson or $toDatabaseJson if Model.cloneObjectAttributes = false', () => {
      class Person extends Model {
        static get cloneObjectAttributes() {
          return false;
        }
      }

      const obj = {
        foo: {
          bar: 1,
        },
      };

      const person = Person.fromDatabaseJson({
        objectField: obj,
      });

      expect(person.objectField).toBe(obj);

      let json = person.$toDatabaseJson();

      expect(person.objectField).toBe(obj);
      expect(json.objectField).toBe(obj);

      json = person.$toJson();

      expect(person.objectField).toBe(obj);
      expect(json.objectField).toBe(obj);

      json = person.toJSON();

      expect(person.objectField).toBe(obj);
      expect(json.objectField).toBe(obj);
    });
  });

  it('relationMappings can be a function', () => {
    let Model1 = modelClass('Model1');
    let Model2 = modelClass('Model2');

    Model1.relationMappings = () => {
      return {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
      };
    };

    expect(Model1.getRelation('relation1').relatedModelClass).toBe(Model2);
  });

  it('if pickJsonSchemaProperties = true and jsonSchema is given, should remove all but schema properties from database representation', () => {
    let Model = modelClass('Model');

    Model.pickJsonSchemaProperties = true;

    Model.jsonSchema = {
      type: 'object',
      properties: {
        prop1: { type: 'number' },
        prop2: { type: 'string' },
      },
    };

    let model = Model.fromJson({
      prop1: 10,
      prop2: '10',
      prop3: 'should be removed',
      prop4: { also: 'this' },
    });

    let json = model.$toDatabaseJson();

    expect(json.prop1).toBe(10);
    expect(json.prop2).toBe('10');
    expect(json.prop3).toBeUndefined();
    expect(json.prop4).toBeUndefined();

    expect(model.prop1).toBe(10);
    expect(model.prop2).toBe('10');
    expect(model.prop3).toBe('should be removed');
    expect(model.prop4).toEqual({ also: 'this' });

    json = model.$toJson();

    expect(json.prop1).toBe(10);
    expect(json.prop2).toBe('10');
    expect(json.prop3).toBe('should be removed');
    expect(json.prop4).toEqual({ also: 'this' });
  });

  it('if pickJsonSchemaProperties = true and jsonSchema is given, should omit relations even if defined in jsonSchema', () => {
    let Model = modelClass('Model');

    Model.pickJsonSchemaProperties = true;

    Model.relationMappings = {
      someRelation: {
        relation: Model.BelongsToOneRelation,
        modelClass: Model,
        join: {
          from: 'Model.id',
          to: 'Model.model1Id',
        },
      },
    };

    Model.jsonSchema = {
      type: 'object',
      properties: {
        someRelation: { type: 'object' },
      },
    };

    let model = Model.fromJson({
      someRelation: {
        value: 'should be removed',
      },
    });

    let json = model.$toDatabaseJson();
    expect(json.someRelation).toBeUndefined();
    expect(model.someRelation).toEqual({ value: 'should be removed' });
    json = model.$toJson();
    expect(json.someRelation).toEqual({ value: 'should be removed' });
  });

  it('if pickJsonSchemaProperties = false, should select all properties even if jsonSchema is defined', () => {
    // pickJsonSchemaProperties = false is the default.
    let Model = modelClass('Model');

    Model.jsonSchema = {
      type: 'object',
      properties: {
        prop1: { type: 'number' },
        prop2: { type: 'string' },
      },
    };

    let model = Model.fromJson({
      prop1: 10,
      prop2: '10',
      prop3: 'should not be removed',
      prop4: { also: 'this' },
    });

    let json = model.$toDatabaseJson();

    expect(json.prop1).toBe(10);
    expect(json.prop2).toBe('10');
    expect(json.prop3).toBe('should not be removed');
    expect(json.prop4).toEqual({ also: 'this' });

    expect(model.prop1).toBe(10);
    expect(model.prop2).toBe('10');
    expect(model.prop3).toBe('should not be removed');
    expect(model.prop4).toEqual({ also: 'this' });

    json = model.$toJson();

    expect(json.prop1).toBe(10);
    expect(json.prop2).toBe('10');
    expect(json.prop3).toBe('should not be removed');
    expect(json.prop4).toEqual({ also: 'this' });
  });

  it('should convert objects to json based on jsonSchema type', () => {
    let Model = modelClass('Model');

    Model.jsonSchema = {
      type: 'object',
      properties: {
        prop1: { type: 'string' },
        prop2: {
          type: 'object',
          properties: {
            subProp1: { type: 'number' },
          },
        },
        prop3: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subProp2: { type: 'boolean' },
            },
          },
        },
        prop4: {
          anyOf: [
            {
              type: 'array',
            },
            {
              type: 'string',
            },
          ],
        },
        prop5: {
          oneOf: [
            {
              type: 'object',
            },
            {
              type: 'string',
            },
          ],
        },
      },
    };

    let inputJson = {
      prop1: 'text',
      prop2: {
        subProp1: 1000,
      },
      prop3: [{ subProp2: true }, { subProp2: false }],
      prop4: [1, 2, 3],
      prop5: {
        subProp3: 'str',
      },
    };

    let model = Model.fromJson(inputJson);

    expect(model).toEqual(inputJson);

    let dbJson = model.$toDatabaseJson();

    expect(dbJson.prop1).toBe('text');
    expect(dbJson.prop2).toBe('{"subProp1":1000}');
    expect(dbJson.prop3).toBe('[{"subProp2":true},{"subProp2":false}]');
    expect(dbJson.prop4).toBe('[1,2,3]');
    expect(dbJson.prop5).toBe('{"subProp3":"str"}');

    let model2 = Model.fromDatabaseJson(dbJson);

    expect(model2).toEqual(inputJson);
  });

  it('should convert objects to json based on jsonAttributes array', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'TestModel';
      }

      static get jsonSchema() {
        return {
          type: 'object',

          properties: {
            prop1: { type: 'string' },
            prop2: {
              type: 'object',
              properties: {
                subProp1: { type: 'number' },
              },
            },

            // This will not be converted because it is not listed in `jsonAttributes`.
            prop3: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  subProp2: { type: 'boolean' },
                },
              },
            },
          },
        };
      }

      static get jsonAttributes() {
        return ['prop2'];
      }
    }

    let inputJson = {
      prop1: 'text',
      prop2: {
        subProp1: 1000,
      },
      prop3: [{ subProp2: true }, { subProp2: false }],
    };

    let model = TestModel.fromJson(inputJson);

    expect(model).toEqual(inputJson);

    let dbJson = model.$toDatabaseJson();

    expect(dbJson.prop1).toBe('text');
    expect(dbJson.prop2).toBe('{"subProp1":1000}');
    expect(dbJson.prop3).toEqual(inputJson.prop3);

    let model2 = TestModel.fromDatabaseJson(dbJson);

    expect(model2).toEqual(inputJson);
  });

  it('$setJson should do nothing if null is given', () => {
    let Model = modelClass('Model');
    let model = Model.fromJson({ a: 1, b: 2 });
    model.$setJson(null);
    expect(model).toEqual({ a: 1, b: 2 });
  });

  it('$setRelated should set related model instances', () => {
    let Model1 = modelClass('Model1');
    let Model2 = modelClass('Model2');

    Model1.relationMappings = {
      hasMany: {
        relation: Model.HasManyRelation,
        modelClass: Model2,
        join: {
          from: 'Model1.id',
          to: 'Model2.model1Id',
        },
      },
      belongsToOne: {
        relation: Model.BelongsToOneRelation,
        modelClass: Model1,
        join: {
          from: 'Model1.id',
          to: 'Model1.model1Id',
        },
      },
      manyToMany: {
        relation: Model.ManyToManyRelation,
        modelClass: Model1,
        join: {
          from: 'Model1.id',
          through: {
            from: 'Model1_Model1.id1',
            to: 'Model1_Model1.id2',
          },
          to: 'Model1.id',
        },
      },
    };

    const model1 = Model1.fromJson({});

    const setResult = model1.$setRelated('hasMany', Model2.fromJson({ id: 1 }));
    expect(model1.hasMany).toEqual([{ id: 1 }]);
    expect(setResult === model1).toBe(true);

    model1.$setRelated('hasMany', [Model2.fromJson({ id: 2 })]);
    expect(model1.hasMany).toEqual([{ id: 2 }]);

    model1.$setRelated('belongsToOne', Model1.fromJson({ id: 1 }));
    expect(model1.belongsToOne).toEqual({ id: 1 });

    model1.$setRelated('belongsToOne', [Model1.fromJson({ id: 2 })]);
    expect(model1.belongsToOne).toEqual({ id: 2 });

    model1.$setRelated('manyToMany', Model1.fromJson({ id: 1 }));
    expect(model1.manyToMany).toEqual([{ id: 1 }]);

    model1.$setRelated('manyToMany', [Model1.fromJson({ id: 2 })]);
    expect(model1.manyToMany).toEqual([{ id: 2 }]);
  });

  it('appendRelated should append related model instances', () => {
    let Model1 = modelClass('Model1');
    let Model2 = modelClass('Model2');

    Model1.relationMappings = {
      hasMany: {
        relation: Model.HasManyRelation,
        modelClass: Model2,
        join: {
          from: 'Model1.id',
          to: 'Model2.model1Id',
        },
      },
      belongsToOne: {
        relation: Model.BelongsToOneRelation,
        modelClass: Model1,
        join: {
          from: 'Model1.id',
          to: 'Model1.model1Id',
        },
      },
      manyToMany: {
        relation: Model.ManyToManyRelation,
        modelClass: Model1,
        join: {
          from: 'Model1.id',
          through: {
            from: 'Model1_Model1.id1',
            to: 'Model1_Model1.id2',
          },
          to: 'Model1.id',
        },
      },
    };

    const model1 = Model1.fromJson({});

    const appendResult = model1.$appendRelated('hasMany', Model2.fromJson({ id: 1 }));
    expect(model1.hasMany).toEqual([{ id: 1 }]);
    expect(appendResult === model1).toBe(true);

    model1.$appendRelated('hasMany', [Model2.fromJson({ id: 2 })]);
    expect(model1.hasMany).toEqual([{ id: 1 }, { id: 2 }]);

    model1.$appendRelated('belongsToOne', Model1.fromJson({ id: 1 }));
    expect(model1.belongsToOne).toEqual({ id: 1 });

    model1.$appendRelated('belongsToOne', [Model1.fromJson({ id: 2 })]);
    expect(model1.belongsToOne).toEqual({ id: 2 });

    model1.$appendRelated('manyToMany', Model1.fromJson({ id: 1 }));
    expect(model1.manyToMany).toEqual([{ id: 1 }]);

    model1.$appendRelated('manyToMany', [Model1.fromJson({ id: 2 })]);
    expect(model1.manyToMany).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('$toJson should return result without relations if {shallow: true} is given as argument', () => {
    let Model = modelClass('Model');

    Model.relationMappings = {
      someRelation: {
        relation: Model.BelongsToOneRelation,
        modelClass: Model,
        join: {
          from: 'Model.id',
          to: 'Model.model1Id',
        },
      },
    };

    let model = Model.fromJson({ a: 1, b: 2, someRelation: { a: 3, b: 4 } });

    expect(model.$toJson()).toEqual({ a: 1, b: 2, someRelation: { a: 3, b: 4 } });
    expect(model.$toJson({ shallow: true })).toEqual({ a: 1, b: 2 });
  });

  it('toJSON should return result without relations if {shallow: true} is given as argument', () => {
    let Model = modelClass('Model');

    Model.relationMappings = {
      someRelation: {
        relation: Model.BelongsToOneRelation,
        modelClass: Model,
        join: {
          from: 'Model.id',
          to: 'Model.model1Id',
        },
      },
    };

    let model = Model.fromJson({ a: 1, b: 2, someRelation: { a: 3, b: 4 } });

    expect(model.toJSON()).toEqual({ a: 1, b: 2, someRelation: { a: 3, b: 4 } });
    expect(model.toJSON({ shallow: true })).toEqual({ a: 1, b: 2 });
  });

  it('Model.raw should return objection.raw', () => {
    expect(modelClass('Model').raw).toBe(raw);
  });

  it('ensureModel should return null for null input', () => {
    let Model = modelClass('Model');
    expect(Model.ensureModel(null)).toBeNull();
  });

  it('ensureModelArray should return [] for null input', () => {
    let Model = modelClass('Model');
    expect(Model.ensureModelArray(null)).toEqual([]);
  });

  it('fetchGraph should return a QueryBuilder', () => {
    let Model = modelClass('Model1');
    expect(Model.fetchGraph([], '[]')).toBeInstanceOf(QueryBuilder);
  });

  it('$fetchGraph should return a QueryBuilder', () => {
    let Model = modelClass('Model1');
    expect(Model.fromJson({}).$fetchGraph('[]')).toBeInstanceOf(QueryBuilder);
  });

  it('loadRelated should throw if an invalid expression is given', () => {
    let Model = modelClass('Model1');
    expect(() => {
      Model.loadRelated([], 'notAValidExpression.');
    }).toThrow();
  });

  it('loadRelated should throw if an invalid expression is given', () => {
    let Model = modelClass('Model1');
    expect(() => {
      Model.loadRelated([], 'notAValidExpression.');
    }).toThrow();
  });

  it('should use Model.QueryBuilder to create `query()` and `$query()`', () => {
    class MyQueryBuilder1 extends QueryBuilder {}
    class MyQueryBuilder2 extends QueryBuilder {}

    const Model1 = modelClass('Model1');
    const Model2 = modelClass('Model2');

    Model1.relationMappings = {
      someRelation: {
        relation: Model.HasManyRelation,
        modelClass: Model2,
        join: {
          from: 'Model1.id',
          to: 'Model2.someId',
        },
      },
    };

    Model1.QueryBuilder = MyQueryBuilder1;
    Model2.QueryBuilder = MyQueryBuilder2;

    expect(Model1.query()).toBeInstanceOf(MyQueryBuilder1);
    expect(Model1.fromJson({}).$query()).toBeInstanceOf(MyQueryBuilder1);
    expect(Model1.fromJson({}).$relatedQuery('someRelation')).toBeInstanceOf(MyQueryBuilder2);
  });

  it('$modelClass should return this.constructor', () => {
    let Model1 = modelClass('Model1');
    let model = Model1.fromJson({ id: 1 });
    expect(model.$modelClass === model.constructor).toBe(true);
  });

  describe('traverse() and $traverse()', () => {
    let Model1;
    let Model2;
    let model;

    beforeEach(() => {
      Model1 = modelClass('Model1');
      Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };
    });

    beforeEach(() => {
      model = Model1.fromJson({
        id: 1,
        model1Id: 2,
        relation1: [
          { id: 4, model1Id: 1 },
          { id: 5, model1Id: 1 },
        ],
        relation2: {
          id: 2,
          model1Id: 3,
          relation1: [
            { id: 6, model1Id: 2 },
            { id: 7, model1Id: 2 },
          ],
          relation2: {
            id: 3,
            model1Id: null,
            relation1: [
              { id: 8, model1Id: 3 },
              { id: 9, model1Id: 3 },
              { id: 10, model1Id: 3 },
              { id: 11, model1Id: 3 },
              { id: 12, model1Id: 3 },
              { id: 13, model1Id: 3 },
              { id: 14, model1Id: 3 },
              { id: 15, model1Id: 3 },
              { id: 16, model1Id: 3 },
              { id: 17, model1Id: 3 },
              { id: 18, model1Id: 3 },
              { id: 19, model1Id: 3 },
              { id: 20, model1Id: 3 },
              { id: 21, model1Id: 3 },
              { id: 22, model1Id: 3 },
              { id: 23, model1Id: 3 },
              { id: 24, model1Id: 3 },
              { id: 25, model1Id: 3 },
            ],
          },
        },
      });
    });

    it('traverse(modelArray, traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      Model1.traverse([model], (model) => {
        if (model instanceof Model1) {
          model1Ids.push(model.id);
        } else if (model instanceof Model2) {
          model2Ids.push(model.id);
        }
      });

      expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
      expect(sortBy(model2Ids)).toEqual(range(4, 26));
    });

    it('traverse([], traverser) should not throw', () => {
      expect(() => {
        Model1.traverse([], function () {});
      }).not.toThrow();
    });

    it('traverse(undefined, traverser) should not throw', () => {
      expect(() => {
        Model1.traverse(undefined, function () {});
      }).not.toThrow();
    });

    it('traverse callback should be passed the model, its parent (if any) and the relation it is in (if any)', () => {
      Model1.traverse([model], (model, parent, relationName) => {
        if (model instanceof Model1) {
          if (model.id === 1) {
            expect(parent).toBeNull();
            expect(relationName).toBeNull();
          } else if (model.id === 2) {
            expect(parent.id).toBe(1);
            expect(relationName).toBe('relation2');
          } else if (model.id === 3) {
            expect(parent.id).toBe(2);
            expect(relationName).toBe('relation2');
          } else {
            throw new Error('should never get here');
          }
        } else if (model instanceof Model2) {
          if (model.id >= 4 && model.id <= 5) {
            expect(parent).toBeInstanceOf(Model1);
            expect(parent.id).toBe(1);
            expect(relationName).toBe('relation1');
          } else if (model.id >= 6 && model.id <= 7) {
            expect(parent).toBeInstanceOf(Model1);
            expect(parent.id).toBe(2);
            expect(relationName).toBe('relation1');
          } else if (model.id >= 8 && model.id <= 25) {
            expect(parent).toBeInstanceOf(Model1);
            expect(parent.id).toBe(3);
            expect(relationName).toBe('relation1');
          } else {
            throw new Error('should never get here');
          }
        }
      });
    });

    it('traverse(singleModel, traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      Model1.traverse(model, (model) => {
        if (model instanceof Model1) {
          model1Ids.push(model.id);
        } else if (model instanceof Model2) {
          model2Ids.push(model.id);
        }
      });

      expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
      expect(sortBy(model2Ids)).toEqual(range(4, 26));
    });

    it('traverse(null, singleModel, traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      Model1.traverse(null, model, (model) => {
        if (model instanceof Model1) {
          model1Ids.push(model.id);
        } else if (model instanceof Model2) {
          model2Ids.push(model.id);
        }
      });

      expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
      expect(sortBy(model2Ids)).toEqual(range(4, 26));
    });

    it('traverse(ModelClass, model, traverser) should traverse through all ModelClass instances in the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      Model1.traverse(Model2, model, (model) => {
        model2Ids.push(model.id);
      }).traverse(Model1, model, (model) => {
        model1Ids.push(model.id);
      });

      expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
      expect(sortBy(model2Ids)).toEqual(range(4, 26));
    });

    it('$traverse(traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      model.$traverse((model) => {
        if (model instanceof Model1) {
          model1Ids.push(model.id);
        } else if (model instanceof Model2) {
          model2Ids.push(model.id);
        }
      });

      expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
      expect(sortBy(model2Ids)).toEqual(range(4, 26));
    });

    it('$traverse(ModelClass, traverser) should traverse through the ModelClass instances in the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      model
        .$traverse(Model1, (model) => {
          model1Ids.push(model.id);
        })
        .$traverse(Model2, (model) => {
          model2Ids.push(model.id);
        });

      expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
      expect(sortBy(model2Ids)).toEqual(range(4, 26));
    });
  });

  describe('traverseAsync() and $traverseAsync()', () => {
    let Model1;
    let Model2;
    let model;

    beforeEach(() => {
      Model1 = modelClass('Model1');
      Model2 = modelClass('Model2');

      Model1.relationMappings = {
        relation1: {
          relation: Model.HasManyRelation,
          modelClass: Model2,
          join: {
            from: 'Model1.id',
            to: 'Model2.model1Id',
          },
        },
        relation2: {
          relation: Model.BelongsToOneRelation,
          modelClass: Model1,
          join: {
            from: 'Model1.id',
            to: 'Model1.model1Id',
          },
        },
      };
    });

    beforeEach(() => {
      model = Model1.fromJson({
        id: 1,
        model1Id: 2,
        relation1: [
          { id: 4, model1Id: 1 },
          { id: 5, model1Id: 1 },
        ],
        relation2: {
          id: 2,
          model1Id: 3,
          relation1: [
            { id: 6, model1Id: 2 },
            { id: 7, model1Id: 2 },
          ],
          relation2: {
            id: 3,
            model1Id: null,
            relation1: [
              { id: 8, model1Id: 3 },
              { id: 9, model1Id: 3 },
              { id: 10, model1Id: 3 },
              { id: 11, model1Id: 3 },
              { id: 12, model1Id: 3 },
              { id: 13, model1Id: 3 },
              { id: 14, model1Id: 3 },
              { id: 15, model1Id: 3 },
              { id: 16, model1Id: 3 },
              { id: 17, model1Id: 3 },
              { id: 18, model1Id: 3 },
              { id: 19, model1Id: 3 },
              { id: 20, model1Id: 3 },
              { id: 21, model1Id: 3 },
              { id: 22, model1Id: 3 },
              { id: 23, model1Id: 3 },
              { id: 24, model1Id: 3 },
              { id: 25, model1Id: 3 },
            ],
          },
        },
      });
    });

    it('traverseAsync(modelArray, traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      return Model1.traverseAsync([model], (model) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (model instanceof Model1) {
              model1Ids.push(model.id);
            } else if (model instanceof Model2) {
              model2Ids.push(model.id);
            }
            resolve();
          }, 5);
        });
      }).then(() => {
        expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
        expect(sortBy(model2Ids)).toEqual(range(4, 26));
      });
    });

    it('traverseAsync(singleModel, traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      return Model1.traverseAsync(model, (model) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (model instanceof Model1) {
              model1Ids.push(model.id);
            } else if (model instanceof Model2) {
              model2Ids.push(model.id);
            }
            resolve();
          }, 5);
        });
      }).then(() => {
        expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
        expect(sortBy(model2Ids)).toEqual(range(4, 26));
      });
    });

    it('traverseAsync callback should be passed the model, its parent (if any) and the relation it is in (if any)', () => {
      return Model1.traverseAsync([model], (model, parent, relationName) => {
        if (model instanceof Model1) {
          if (model.id === 1) {
            expect(parent).toBeNull();
            expect(relationName).toBeNull();
          } else if (model.id === 2) {
            expect(parent.id).toBe(1);
            expect(relationName).toBe('relation2');
          } else if (model.id === 3) {
            expect(parent.id).toBe(2);
            expect(relationName).toBe('relation2');
          } else {
            throw new Error('should never get here');
          }
        } else if (model instanceof Model2) {
          if (model.id >= 4 && model.id <= 5) {
            expect(parent).toBeInstanceOf(Model1);
            expect(parent.id).toBe(1);
            expect(relationName).toBe('relation1');
          } else if (model.id >= 6 && model.id <= 7) {
            expect(parent).toBeInstanceOf(Model1);
            expect(parent.id).toBe(2);
            expect(relationName).toBe('relation1');
          } else if (model.id >= 8 && model.id <= 25) {
            expect(parent).toBeInstanceOf(Model1);
            expect(parent.id).toBe(3);
            expect(relationName).toBe('relation1');
          } else {
            throw new Error('should never get here');
          }
        }
      });
    });

    it('traverseAsync(ModelClass, model, traverser) should traverse through all ModelClass instances in the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      return Model1.traverseAsync(Model2, model, (model) => {
        model2Ids.push(model.id);
      })
        .then(() => {
          return Model1.traverseAsync(Model1, model, (model) => {
            model1Ids.push(model.id);
          });
        })
        .then(() => {
          expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
          expect(sortBy(model2Ids)).toEqual(range(4, 26));
        });
    });

    it('$traverseAsync(traverser) should traverse through the relation tree', () => {
      let model1Ids = [];
      let model2Ids = [];

      return model
        .$traverseAsync((model) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              if (model instanceof Model1) {
                model1Ids.push(model.id);
              } else if (model instanceof Model2) {
                model2Ids.push(model.id);
              }
              resolve();
            }, 5);
          });
        })
        .then(() => {
          expect(sortBy(model1Ids)).toEqual([1, 2, 3]);
          expect(sortBy(model2Ids)).toEqual(range(4, 26));
        });
    });
  });

  it('$validate should run hooks and strip relations', () => {
    let Model1 = modelClass('Model1');

    Model1.prototype.$parseJson = function (json, opt) {
      json = Model.prototype.$parseJson.apply(this, arguments);
      json.foo = parseInt(json.foo);
      return json;
    };

    Model1.prototype.$formatJson = function (json, opt) {
      json = Model.prototype.$formatJson.apply(this, arguments);
      json.foo = json.foo.toString();
      return json;
    };

    Model1.jsonSchema = {
      type: 'object',
      properties: {
        foo: { type: 'integer' },
      },
    };

    Model1.relationMappings = {
      someRelation: {
        relation: Model.BelongsToOneRelation,
        modelClass: Model1,
        join: {
          from: 'Model1.id',
          to: 'Model1.someId',
        },
      },
    };

    let model = Model1.fromJson({ foo: '10' });
    model.someRelation = Model1.fromJson({ foo: '20' });

    expect(model.foo).toBe(10);
    model.$validate();
    expect(model.foo).toBe(10);

    expect(model.$toJson().foo).toBe('10');
  });

  it('Model.fn should return objection.fn', () => {
    expect(modelClass('Model1').fn).toBe(fn);
  });

  it('make sure JSON.stringify works with toJSON (#869)', () => {
    class Person extends Model {
      static get idColumn() {
        return 'key';
      }
    }

    const p1 = Person.fromJson({ key: 1 });
    const p2 = Person.fromJson({ key: 2 });

    JSON.stringify([p1, p2]);
  });

  function modelClass(tableName) {
    return class TestModel extends Model {
      static get tableName() {
        return tableName;
      }
    };
  }

  function createModelClass(proto, staticStuff) {
    class Model1 extends Model {}

    Object.assign(Model1.prototype, proto);
    Object.assign(Model1, staticStuff);

    return Model1;
  }
});
