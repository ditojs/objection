import { EagerOperation } from './EagerOperation.js';
import { RelationJoiner } from '../../join/RelationJoiner.js';
import { JoinedStaticHookArguments } from '../../StaticHookArguments.js';
import { asArray } from '../../../utils/objectUtils.js';

export class JoinEagerOperation extends EagerOperation {
  constructor(name, opt) {
    super(name, opt);
    this.joiner = null;
    this.models = null;
  }

  onAdd(builder) {
    builder.findOptions({ callAfterFindDeeply: true });

    this.joiner = new RelationJoiner({
      modelClass: builder.modelClass(),
    });

    return true;
  }

  onBefore3(builder) {
    return this.fetchTableMetadata(builder);
  }

  // Also called by `resultSize()`, which builds the query without executing it.
  fetchTableMetadata(builder) {
    return this.joiner
      .setExpression(this.buildFinalExpression(builder))
      .setModifiers(this.buildFinalModifiers(builder))
      .setOptions(this.graphOptions)
      .setJoinOperations(this.joinOperations)
      .fetchColumnInfo(builder);
  }

  onBuild(builder) {
    this.joiner
      .setExpression(this.buildFinalExpression(builder))
      .setModifiers(this.buildFinalModifiers(builder))
      .setOptions(this.graphOptions)
      .setJoinOperations(this.joinOperations)
      .build(builder);
  }

  onRawResult(builder, rows) {
    this.models = this.joiner.parseResult(builder, rows);
    return this.models;
  }

  // Call the static `afterFind()` hooks of the joined relations bottom-up, after
  // the `$afterFind()` hooks of all models, and assign the related models that
  // they return, like `withGraphFetched()` does.
  async onAfter3(builder, result) {
    if (Array.isArray(this.models)) {
      const [rootNode, ...nodes] = this.joiner.tableTree.nodes;
      const modelsByNode = new Map([[rootNode, this.models]]);
      const ownerByModel = new Map();

      // The nodes are ordered from the root down, so the owners come first:
      for (const node of nodes) {
        const models = [];

        for (const owner of modelsByNode.get(node.parentNode)) {
          for (const model of asArray(owner[node.relationProperty])) {
            if (model) {
              models.push(model);
              ownerByModel.set(model, owner);
            }
          }
        }

        modelsByNode.set(node, models);
      }

      for (const node of nodes.reverse()) {
        const { modelClass, relation, relationProperty } = node;
        const owners = modelsByNode.get(node.parentNode);
        const models = modelsByNode.get(node);
        const args = JoinedStaticHookArguments.create({
          builder,
          result: models,
          relation,
          items: owners,
        });
        const related = await modelClass.afterFind(args);

        if (related !== undefined) {
          const relatedByOwner = new Map(owners.map((owner) => [owner, []]));

          for (const model of asArray(related)) {
            const relatedOfOwner = relatedByOwner.get(ownerByModel.get(model));

            if (!relatedOfOwner) {
              throw new Error(
                `Unable to assign the result of ${modelClass.name}.afterFind() to the relation ` +
                  `"${relation.name}" of ${relation.ownerModelClass.name}: return the models ` +
                  'you got, filtered or reordered.',
              );
            }

            relatedOfOwner.push(model);
          }

          for (const [owner, related] of relatedByOwner) {
            owner[relationProperty] = relation.isOneToOne() ? related[0] || null : related;
          }
        }
      }
    }

    return result;
  }

  clone() {
    const clone = super.clone();
    clone.joiner = this.joiner;
    return clone;
  }
}
