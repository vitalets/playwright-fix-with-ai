# "🤖 Fix with AI" Button in Playwright HTML Report

An example repo for demonstration [fixing Playwright tests with AI](https://dev.to/vitalets/fix-with-ai-button-in-playwright-html-report-2j37).

To check it yourself, follow the instructions:

1. Clone the repo
   ```
   git clone https://github.com/vitalets/playwright-fix-with-ai.git
   cd playwright-fix-with-ai
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Install Playwright browsers
   ```
   npx playwright install chromium
   ```

4. Ensure test pass
   ```
   npx playwright test
   ```
   Output:
   ```
   Running 1 test using 1 worker
     1 passed (2.7s)
   ```  

5. Modify `test/sample.spec.ts` to fail the test, e.g.:
   ```diff
   test('get started link', async ({ page }) => {
     await page.goto('https://playwright.dev');
   -  await page.getByRole('link', { name: 'Get started' }).click();
   +  await page.getByRole('button', { name: 'Get started' }).click();
     await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
   });
   ```

6. Run tests again
   ```
   npx playwright test
   ```

7. Open HTML report:
   ```
   npx playwright show-report
   ```

8. Click on `🤖 Fix with AI` and copy prompt

9. Paste prompt to [ChatGPT](https://chatgpt.com/)

10. Apply ChatGPT suggegted changes to fix the test
