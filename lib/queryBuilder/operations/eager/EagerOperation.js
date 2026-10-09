'use strict';

const { QueryBuilderOperation } = require('../QueryBuilderOperation');
const { RelationExpression } = require('../../RelationExpression');

class EagerOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.expression = RelationExpression.create();
    this.graphOptions = this.opt.defaultGraphOptions;
  }

  buildFinalExpression(builder) {
    const expression = this.expression.clone();

    builder.graphModifiersAtPath().forEach((modifier, i) => {
      const modifierName = getModifierName(i);

      expression.expressionsAtPath(modifier.path).forEach((expr) => {
        expr.node.$modify.push(modifierName);
      });
    });

    return expression;
  }

  buildFinalModifiers(builder) {
    // `modifiers()` returns a clone so we can modify it.
    const modifiers = builder.modifiers();

    builder.graphModifiersAtPath().forEach((modifier, i) => {
      const modifierName = getModifierName(i);

      modifiers[modifierName] = modifier.modifier;
    });

    return modifiers;
  }

  cloneFrom(eagerOp) {
    this.expression = eagerOp.expression.clone();
    this.graphOptions = Object.assign({}, eagerOp.graphOptions);
  }

  clone() {
    const clone = super.clone();
    clone.cloneFrom(this);
    return clone;
  }
}

function getModifierName(index) {
  return `_f${index}_`;
}

module.exports = {
  EagerOperation,
};
