import prettier from 'eslint-plugin-prettier';
import globals from 'globals';

export default [
  {
    languageOptions: {
      globals: globals.node,
    },
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'error',
      'no-undef': 'error',
    },
  },
  {
    files: ['tests/unit/relations/files/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
