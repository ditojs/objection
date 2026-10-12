# Plugins

## TypeScript Example

```ts
type Constructor<T> = new (...args: any[]) => T;

export function Mixin() {
  return function <T extends Constructor<Model>>(Base: T) {
    return class extends Base {
      mixinMethod() {}
    };
  };
}

// Usage

class Person extends Model {}

const MixinPerson = Mixin()(Person);
```

## TypeScript Example with Custom QueryBuilder

```ts
type Constructor<T> = new (...args: any[]) => T;

class CustomQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  declare RebindType: CustomQueryBuilder<this['~M'], this['~R']>;

  someCustomMethod(): this {
    return this;
  }
}

export function CustomQueryBuilderMixin() {
  return function <T extends Constructor<Model>>(Base: T) {
    return class extends Base {
      static QueryBuilder = CustomQueryBuilder;
      declare QueryBuilderType: CustomQueryBuilder<this>;

      mixinMethod() {}
    };
  };
}

// Usage

class Person extends Model {
  id!: number;
}

const MixinPerson = CustomQueryBuilderMixin()(Person);

async () => {
  const z = await MixinPerson.query()
    .whereIn('id', [1, 2])
    .someCustomMethod()
    .where('id', 1)
    .someCustomMethod();

  z[0].mixinMethod();
};
```
