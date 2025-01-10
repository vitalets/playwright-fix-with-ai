import { test as base } from '@playwright/test';
import { attachFixWithAI } from './fix-with-ai';

export const test = base.extend<{ fixWithAI: void }>({
  fixWithAI: [async ({ page }, use, testInfo) => {
    await use();
    await attachFixWithAI(page, testInfo);
  }, { scope: 'test', auto: true }],
});

