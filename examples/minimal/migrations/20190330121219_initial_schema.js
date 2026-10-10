export function up(knex) {
  return knex.schema.createTable('persons', (table) => {
    table.increments('id').primary();
    table.string('firstName');
    table.string('lastName');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('persons');
}
