// ESLint v9 flat config for Beeline.
// Uses the already-installed @typescript-eslint parser/plugin (no extra deps).
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'examples/**', 'tests/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // The codebase intentionally uses `any` for loosely-typed dhive payloads.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentional throwaway params/vars prefixed with underscore.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `case` blocks that declare consts (history.ts switch) are fine.
      'no-case-declarations': 'off',
      // This is a CommonJS build (module: "commonjs"); require() is used
      // intentionally for lazy/dynamic plugin loading.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
