const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  describe('upsertGraph relate with a composite id that contains the foreign key #2544', () => {
    const { knex } = session;
    let Order;
    let OrderItem;

    before(() => {
      return knex.schema
        .dropTableIfExists('order_items_2544')
        .dropTableIfExists('orders_2544')
        .createTable('orders_2544', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('order_items_2544', (table) => {
          table.integer('order_id');
          table.integer('product_id');
          table.integer('quantity');
          table.primary(['order_id', 'product_id']);
        });
    });

    after(() => {
      return knex.schema.dropTableIfExists('order_items_2544').dropTableIfExists('orders_2544');
    });

    before(() => {
      OrderItem = class OrderItem extends Model {
        static get tableName() {
          return 'order_items_2544';
        }

        static get idColumn() {
          return ['order_id', 'product_id'];
        }
      };

      Order = class Order extends Model {
        static get tableName() {
          return 'orders_2544';
        }

        static get relationMappings() {
          return {
            items: {
              relation: Model.HasManyRelation,
              modelClass: OrderItem,
              join: {
                from: 'orders_2544.id',
                to: 'order_items_2544.order_id',
              },
            },
          };
        }
      };

      Order.knex(knex);
    });

    beforeEach(() => {
      return knex('order_items_2544')
        .delete()
        .then(() => knex('orders_2544').delete());
    });

    const items = () =>
      knex('order_items_2544').select('order_id', 'product_id', 'quantity').orderBy('product_id');

    it('should insert children of a new parent', async () => {
      const order = await Order.query().upsertGraphAndFetch(
        { id: 1, name: 'order', items: [{ product_id: 2, quantity: 3 }] },
        { relate: true, insertMissing: true },
      );

      expect(order.items.map((it) => it.toJSON())).to.eql([
        { order_id: 1, product_id: 2, quantity: 3 },
      ]);
      expect(await items()).to.eql([{ order_id: 1, product_id: 2, quantity: 3 }]);
    });

    it('should insert children of a new parent using insertGraph', async () => {
      await Order.query().insertGraph(
        { id: 1, name: 'order', items: [{ product_id: 2, quantity: 3 }] },
        { relate: true },
      );

      expect(await items()).to.eql([{ order_id: 1, product_id: 2, quantity: 3 }]);
    });

    it('should replace children of an existing parent', async () => {
      await Order.query().insertGraph({
        id: 1,
        name: 'order',
        items: [{ product_id: 2, quantity: 3 }],
      });

      await Order.query().upsertGraph(
        { id: 1, items: [{ product_id: 2, quantity: 5 }] },
        { relate: true },
      );

      expect(await items()).to.eql([{ order_id: 1, product_id: 2, quantity: 5 }]);
    });
  });
};
