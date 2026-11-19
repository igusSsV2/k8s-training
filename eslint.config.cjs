const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', '.tools/**', 'dist/course.js'] },
  js.configs.recommended,
  {
    files: ['server/**/*.cjs', 'scripts/**/*.cjs', 'tests/**/*.cjs', 'playwright.config.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['dist/app.js', 'dist/control.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser, ...globals.es2021, COURSE: 'readonly' } },
  },
];
