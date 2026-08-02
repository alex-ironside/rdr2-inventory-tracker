import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  {
    ignores: ['dist/', 'dev-dist/', 'coverage/', 'node_modules/', 'src/lib/seed.ts', '**/*.cjs']
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte']
      }
    }
  },
  {
    // Rune modules (`*.svelte.ts`) are plain TypeScript — use the TS parser, not
    // the Svelte template parser.
    files: ['**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parser: ts.parser
    }
  },
  {
    files: ['tests/**/*.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
