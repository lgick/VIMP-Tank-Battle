/* npx eslint . eslint.config.js */

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // базовые рекомендованные правила ESLint
  js.configs.recommended,

  // конфигурация для файлов в корне проекта (конфиги и т.д.)
  {
    files: ['*.js', '*.cjs', '*.mjs'], // eslint.config.js, vite.config.js, etc.
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node, // глобальные переменные Node.js
      },
    },
    rules: {
      'no-console': 'off', // в файлах конфигурации console.log может быть полезен
    },
  },

  // конфигурация серверного кода Node.js
  {
    files: [
      'src/server/**/*.js', // все js файлы в src/server и его подпапках
    ],
    languageOptions: {
      ecmaVersion: 'latest', // последний ECMAScript
      sourceType: 'module', // "type": "module" в package.json
      globals: {
        ...globals.node, // глобальные переменные Node.js (console, process, etc.)
      },
    },
    rules: {
      // предупреждать об использовании console.log на сервере (кроме разработки)
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    },
  },

  // конфигурация для клиентского кода
  {
    files: [
      'src/client/**/*.js', // все JS файлы в src/client и его подпапках
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser, // глобальные переменные браузера (window, document, etc.)
      },
    },
    rules: {
      'no-alert': 'warn', // предупреждать об alert, confirm, prompt
    },
  },
  {
    files: ['src/lib/**/*.js', 'src/config/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.es2023,
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // общие правила для всего проекта (применяются ко всем JS файлам, если не переопределены выше)
  {
    rules: {
      'no-unused-vars': 'off', // предупреждать о неиспользуемых переменных (используется tsserver)
      eqeqeq: ['error', 'always'], // требовать === и !==
      curly: ['error', 'all'], // требовать фигурные скобки для всех блоков if, for, while и т.д.
      'no-else-return': 'warn', // предупреждать о ненужных else после return
      'no-var': 'error', // использовать let/const вместо var
      'prefer-const': 'warn', // предлагать использовать const, если переменная не переназначается
      'object-shorthand': ['warn', 'properties'], // рекомендовать короткий синтаксис для свойств объектов
      'arrow-body-style': ['warn', 'as-needed'], // тело стрелочной функции без {} если возможно
    },
  },

  // отключение правил ESLint, конфликтующих с Prettier
  eslintConfigPrettier,

  // игнорируемые файлы и директории
  {
    ignores: [
      'node_modules/**',
      'dist/**', // результаты сборки Vite
      'public/**', // статика, которую не нужно линтить
      'build/**',
      '**/.*', // игнорировать все файлы/директории, начинающиеся с '.', на любом уровне
      '**/_*', // игнорировать все файлы/директории, начинающиеся с '_', на любом уровне
    ],
  },
];
