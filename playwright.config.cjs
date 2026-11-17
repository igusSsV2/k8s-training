const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {baseURL: 'http://127.0.0.1:8788', browserName: 'chromium', viewport: {width: 1440, height: 1050}, trace: 'retain-on-failure'},
  webServer: {command: 'node tests/fixtures/browser-server.cjs', url: 'http://127.0.0.1:8788/api/health', reuseExistingServer: false},
  outputDir: '.tools/browser-test-results'
});
