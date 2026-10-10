class RelationDoesNotExistError extends Error {
  constructor(relationName) {
    super(`unknown relation "${relationName}" in a relation expression`);

    this.name = this.constructor.name;
    this.relationName = relationName;
  }
}

export { RelationDoesNotExistError };
