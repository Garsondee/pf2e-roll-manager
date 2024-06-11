module.exports = {
  parser: '@typescript-eslint/parser',

  parserOptions: {
    ecmaVersion: 2020,
    extraFileExtensions: ['.cjs', '.mjs'],
    sourceType: 'module',
    project: './tsconfig.eslint.json',
  },

  env: {
    browser: true,
  },

  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
    'plugin:prettier/recommended',
  ],

  plugins: ['@typescript-eslint', 'jest'],

  rules: {
    // Specify any specific ESLint rules.
  },

  overrides: [
    {
      files: ['./*.cjs'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
