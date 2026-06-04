const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  use: {
    baseURL: process.env.SMOKE_BASE_URL || 'https://giggidy.work',
    headless: true,
    viewport: { width: 430, height: 932 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
