import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },

  js.configs.recommended,

  // Application and package sources. Type-aware linting is the point of this
  // block: `tsc` already rejects wrong types, these rules reject correct types
  // used wrongly - a promise nobody awaits, a condition that can never be false,
  // a value narrowed from `any` without anyone noticing.
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      // Domain code uses `readonly` heavily; a mutable local alias is fine.
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
    },
  },

  // React lives only in the apps. The hook rules matter more here than in a
  // normal app: with a federated singleton, a second React instance shows up as
  // a broken hook call, so anything that hides a hook violation costs real
  // debugging time.
  {
    files: ['apps/*/src/**/*.tsx'],
    // `configs.flat` holds the flat-config variants; the top-level
    // `configs['recommended-latest']` is still the legacy shape.
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  // Build configuration runs in Node and is not part of any tsconfig, so it gets
  // the untyped ruleset.
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Static files served as-is to the browser, outside any bundle or tsconfig.
  {
    files: ['apps/*/public/**/*.js'],
    languageOptions: {
      globals: globals.browser,
      sourceType: 'script',
    },
  },

  // Last: switches off everything that only disagrees with Prettier.
  prettier,
);
