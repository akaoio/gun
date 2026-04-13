const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8766',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node test/browser/server.js',
    url: 'http://127.0.0.1:8766',
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome']
    }
  ]
});
