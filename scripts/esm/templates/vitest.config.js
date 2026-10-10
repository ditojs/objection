import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration tests are a single test file that runs all the specs in
    // tests/integration against each database, one after the other.
    include: ['tests/main.js', 'tests/unit/**/*.js', 'tests/integration/index.js'],
    exclude: [...configDefaults.exclude, 'tests/unit/relations/files/**'],
    setupFiles: ['testUtils/setup.js'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Run the hooks in the order they are defined, like mocha.
    sequence: { hooks: 'list' },
    server: {
      deps: {
        // Load objection and the model files of the relation tests natively, so that
        // they share their module instances with the ones that `require()` loads.
        external: [/\/node_modules\//, /\/lib\//, /\/tests\/unit\/relations\/files\//],
      },
    },
  },
});
