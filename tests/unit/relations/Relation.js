import { describe, it, expect, beforeEach } from 'vitest';
import Knex from 'knex';
import * as objection from 'objection';
import { createRequire } from 'node:module';
import EsmRelatedModel from './files/esm/RelatedModel.js';
import { RelatedModel as EsmRelatedModelNamedExport } from './files/esm/RelatedModelNamedExport.js';

// The model files in ./files are CommonJS modules.
const require = createRequire(import.meta.url);

// Converts snake_case and kebab-case keys to camelCase.
const camelCase = (str) => str.replace(/[-_]+(.)/g, (match, char) => char.toUpperCase());
const Relation = objection.Relation;

describe('Relation', () => {
  let OwnerModel = null;
  let RelatedModel = null;
  let RelatedModelNamedExport = null;

  beforeEach(() => {
    delete require.cache[import.meta.dirname + '/files/OwnerModel.js'];
    delete require.cache[import.meta.dirname + '/files/RelatedModel.js'];

    OwnerModel = require(import.meta.dirname + '/files/OwnerModel');
    RelatedModel = require(import.meta.dirname + '/files/RelatedModel');
    RelatedModelNamedExport = require(
      import.meta.dirname + '/files/RelatedModelNamedExport',
    ).RelatedModel;
  });

  it('should accept a Model subclass as modelClass', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('should accept a function returning Model subclass as modelClass', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: () => RelatedModel,
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('should accept a path to a Model subclass as modelClass', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: import.meta.dirname + '/files/RelatedModel',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('should accept a relative path to a Model subclass as modelClass (resolved using Model.modelPaths)', () => {
    OwnerModel.modelPaths = [import.meta.dirname + '/files/'];
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: 'RelatedModel',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('multiple items in `Model.modelPaths` should work', () => {
    OwnerModel.modelPaths = [import.meta.dirname, import.meta.dirname + '/files/'];

    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: 'RelatedModel',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('should accept a module with named exports', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: import.meta.dirname + '/files/RelatedModelNamedExport',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModelNamedExport);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('should accept a path to an ES module with a default export as modelClass', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: import.meta.dirname + '/files/esm/RelatedModel',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.relatedModelClass).toBe(EsmRelatedModel);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
  });

  it('should accept a path to an ES module with named exports as modelClass', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: import.meta.dirname + '/files/esm/RelatedModelNamedExport.js',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.relatedModelClass).toBe(EsmRelatedModelNamedExport);
  });

  it('should resolve ES modules using `Model.modelPaths`', () => {
    OwnerModel.modelPaths = [import.meta.dirname + '/files/esm/'];
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: 'RelatedModel',
      join: {
        from: 'OwnerModel.id',
        to: 'RelatedModel.ownerId',
      },
    });

    expect(relation.relatedModelClass).toBe(EsmRelatedModel);
  });

  it('should accept a composite key as an array of columns', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: ['OwnerModel.name', 'OwnerModel.dateOfBirth'],
        to: ['RelatedModel.ownerName', 'RelatedModel.ownerDateOfBirth'],
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['name', 'dateOfBirth']);
    expect(relation.ownerProp.props).toEqual(['name', 'dateOfBirth']);
    expect(relation.relatedProp.cols).toEqual(['ownerName', 'ownerDateOfBirth']);
    expect(relation.relatedProp.props).toEqual(['ownerName', 'ownerDateOfBirth']);
  });

  it('should accept references created with Model.ref()', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: [OwnerModel.ref('id'), OwnerModel.ref('json:attr')],
        to: [RelatedModel.ref('ownerId'), objection.ref('RelatedModel.ownerAttr')],
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id', 'json']);
    expect(relation.ownerProp.props).toEqual(['id', 'json']);
    expect(relation.ownerProp.getProp({ json: { attr: 1 } }, 1)).toBe(1);
    expect(relation.relatedProp.cols).toEqual(['ownerId', 'ownerAttr']);
    expect(relation.relatedProp.props).toEqual(['ownerId', 'ownerAttr']);
  });

  it('should fail if relation property and the relation itself have the same name', () => {
    let relation = new Relation('foo', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.foo',
          to: 'RelatedModel.ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          "OwnerModel.relationMappings.foo: join: relation name and join property 'foo' cannot have the same name. If you cannot change one or the other, you can use $parseDatabaseJson and $formatDatabaseJson methods to convert the column name.",
      }),
    );
  });

  it('should pass through erros thrown from jsonSchema getter', () => {
    Object.defineProperties(OwnerModel, {
      jsonSchema: {
        enumerable: true,
        get() {
          throw new Error('whoops, invalid json shchema getter');
        },
      },
    });

    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
          to: 'RelatedModel.ownerId',
        },
      });
    }).toThrow(expect.objectContaining({ message: 'whoops, invalid json shchema getter' }));
  });

  it('should fail if modelClass is not a subclass of Model', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: function SomeConstructor() {},
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: modelClass: is not a subclass of Model or a file path to a module that exports one. You may be dealing with circular imports (a require loop). See the documentation section about circular imports.',
      }),
    );
  });

  it('should fail if modelClass resolves to a module that exports multiple model classes', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: import.meta.dirname + '/files/InvalidModelManyNamedModels',
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      /OwnerModel\.relationMappings\.testRelation: modelClass: path .*\/tests\/unit\/relations\/files\/InvalidModelManyNamedModels exports multiple models\. Don't know which one to choose\./,
    );
  });

  it('should fail if modelClass is missing', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: null,
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message: 'OwnerModel.relationMappings.testRelation: modelClass is not defined',
      }),
    );
  });

  it('should fail if modelClass is an invalid file path', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: 'blaa',
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: modelClass: could not resolve blaa using modelPaths',
      }),
    );
  });

  it('should fail if modelClass is a file path that points to a non-model', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: import.meta.dirname + '/files/InvalidModel',
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      /^OwnerModel\.relationMappings\.testRelation: modelClass: (.+)\/InvalidModel is an invalid file path to a model class$/,
    );
  });

  it('should fail if relation is not defined', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message: 'OwnerModel.relationMappings.testRelation: relation is not defined',
      }),
    );
  });

  it('should fail if relation is not a Relation subclass', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: function () {},
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message: 'OwnerModel.relationMappings.testRelation: relation is not a subclass of Relation',
      }),
    );
  });

  it('should fail if OwnerModelClass is not a subclass of Model', () => {
    let relation = new Relation('testRelation', {});

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({ message: "Relation: Relation's owner is not a subclass of Model" }),
    );
  });

  it('join.to should have format ModelName.columnName', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
          to: 'ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: join.to must have format TableName.columnName. For example "SomeTable.id" or in case of composite key ["SomeTable.a", "SomeTable.b"].',
      }),
    );
  });

  it('join.to should point to either of the related model classes', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'SomeOtherModel.id',
          to: 'RelatedModel.ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          "OwnerModel.relationMappings.testRelation: join: either `from` or `to` must point to the owner model table and the other one to the related table. It might be that specified table 'SomeOtherModel' is not correct",
      }),
    );
  });

  it('join.from should have format ModelName.columnName', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'id',
          to: 'RelatedModel.ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: join.from must have format TableName.columnName. For example "SomeTable.id" or in case of composite key ["SomeTable.a", "SomeTable.b"].',
      }),
    );
  });

  it('join.from should point to either of the related model classes', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
          to: 'SomeOtherModel.ownerId',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          "OwnerModel.relationMappings.testRelation: join: either `from` or `to` must point to the owner model table and the other one to the related table. It might be that specified table 'SomeOtherModel' is not correct",
      }),
    );
  });

  it('should fail if join object is missing', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: join must be an object that maps the columns of the related models together. For example: {from: "SomeTable.id", to: "SomeOtherTable.someModelId"}',
      }),
    );
  });

  it('should fail if join.from is missing', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          to: 'OwnerModel.id',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: join must be an object that maps the columns of the related models together. For example: {from: "SomeTable.id", to: "SomeOtherTable.someModelId"}',
      }),
    );
  });

  it('should fail if join.to is missing', () => {
    let relation = new Relation('testRelation', OwnerModel);

    expect(() => {
      relation.setMapping({
        relation: Relation,
        modelClass: RelatedModel,
        join: {
          from: 'OwnerModel.id',
        },
      });
    }).toThrow(
      expect.objectContaining({
        message:
          'OwnerModel.relationMappings.testRelation: join must be an object that maps the columns of the related models together. For example: {from: "SomeTable.id", to: "SomeOtherTable.someModelId"}',
      }),
    );
  });

  it('the values of `join.to` and `join.from` can be swapped', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: 'RelatedModel.ownerId',
        to: 'OwnerModel.id',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['ownerId']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('relatedCol and ownerCol should be in database format', () => {
    let relation = new Relation('testRelation', OwnerModel);

    Object.defineProperty(OwnerModel, 'tableName', {
      get() {
        return 'owner_model';
      },
    });

    OwnerModel.prototype.$parseDatabaseJson = (json) => {
      return Object.fromEntries(
        Object.entries(json).map(([key, value]) => {
          return [camelCase(key), value];
        }),
      );
    };

    Object.defineProperty(RelatedModel, 'tableName', {
      get() {
        return 'related-model';
      },
    });

    RelatedModel.prototype.$parseDatabaseJson = (json) => {
      return Object.fromEntries(
        Object.entries(json).map(([key, value]) => {
          return [camelCase(key), value];
        }),
      );
    };

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: 'owner_model.id_col',
        to: 'related-model.owner-id',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id_col']);
    expect(relation.ownerProp.props).toEqual(['idCol']);
    expect(relation.relatedProp.cols).toEqual(['owner-id']);
    expect(relation.relatedProp.props).toEqual(['ownerId']);
  });

  it('should allow relations on tables under a schema', () => {
    let relation = new Relation('testRelation', OwnerModel);

    Object.defineProperty(OwnerModel, 'tableName', {
      get() {
        return 'schema1.owner_model';
      },
    });

    Object.defineProperty(RelatedModel, 'tableName', {
      get() {
        return 'schema2.related_model';
      },
    });

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: 'schema1.owner_model.id',
        to: 'schema2.related_model.owner_id',
      },
    });

    expect(relation.ownerModelClass).toBe(OwnerModel);
    expect(relation.relatedModelClass).toBe(RelatedModel);
    expect(relation.ownerProp.cols).toEqual(['id']);
    expect(relation.ownerProp.props).toEqual(['id']);
    expect(relation.relatedProp.cols).toEqual(['owner_id']);
    expect(relation.relatedProp.props).toEqual(['owner_id']);
  });

  it('joinModelClass should return null for relations without join models', () => {
    let relation = new Relation('testRelation', OwnerModel);

    relation.setMapping({
      relation: Relation,
      modelClass: RelatedModel,
      join: {
        from: 'RelatedModel.ownerId',
        to: 'OwnerModel.id',
      },
    });

    const knex = Knex({ client: 'pg' });
    expect(relation.joinModelClass).toBeNull();
  });
});
