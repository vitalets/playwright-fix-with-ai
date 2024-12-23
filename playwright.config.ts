import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test',
  reporter: [['html', { open: 'never' }]],
  expect: { 
    timeout: 1000 
  },
  use: {
    actionTimeout: 1000,
  },
});
