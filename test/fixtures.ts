import { test as base } from '@playwright/test';
import { buildPrompt } from './fix-with-ai';

export const test = base.extend<{ fixWithAI: void }>({
  fixWithAI: [async ({ page }, use, testInfo) => {
    await use();
    const willBeRetried = testInfo.retry < testInfo.project.retries;
    if (testInfo.error && !willBeRetried) {
      const prompt = buildPrompt({
        title: testInfo.title,
        error: testInfo.error,
        ariaSnapshot: await page.locator('html').ariaSnapshot(),
      });
      await testInfo.attach('🤖 Fix with AI: copy prompt and paste to AI chat', { body: prompt });
    }
  }, { scope: 'test', auto: true }],
});

