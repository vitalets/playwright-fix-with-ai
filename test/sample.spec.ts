import {expect } from '@playwright/test';
import { test } from './fixtures';

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev');
  // Clicking the link will fail, because it should be "Get started" instead of "Get involved"
  await page.getByRole('link', { name: 'Get involved' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});
