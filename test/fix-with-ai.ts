/**
 * Fix with AI attachment to failed Playwright tests.
 */
import fs from 'node:fs';
import { Page, TestInfo, TestInfoError } from '@playwright/test';
// @ts-ignore
import { parseStackTraceLine } from 'playwright-core/lib/utilsBundle';

const promptTemplate = `
You are an expert in Playwright testing. 
Fix the error in the Playwright test "{title}". 
- Start response with a highlighted diff of fixed code snippet.
- Strictly rely on the ARIA snapshot of the page.
- Avoid adding any new code.
- Avoid adding comments to the code.
- Avoid changing the test logic.
- Use only role-based locators: getByRole, getByLabel, etc.
- For 'heading' role try to adjust level first
- Add concise notes about applied changes at the end of your response.
- If the test may be correct and there is a bug in the page, note it.

{error}

Code snippet of the failing test:

{snippet}

ARIA snapshot of the page:

{ariaSnapshot}
`.trim();

export async function attachFixWithAI(page: Page, testInfo: TestInfo) {
  const willBeRetried = testInfo.retry < testInfo.project.retries;
  if (testInfo.error && !willBeRetried) {
    const prompt = buildPrompt({
      title: testInfo.title,
      error: testInfo.error,
      ariaSnapshot: await page.locator('html').ariaSnapshot(),
    });
    await testInfo.attach('🤖 Fix with AI: copy prompt and paste to AI chat', { body: prompt });
  }
}

function buildPrompt({ title, error, ariaSnapshot }: { 
    title: string, 
    error: TestInfoError, 
    ariaSnapshot: string
}) {
  const errorMessage = stripAnsiEscapes(error.message || '');
  const snippet = getCodeSnippet(error);

  if (!errorMessage || !snippet) return '';

  return promptTemplate
    .replace('{title}', title)
    .replace('{error}', errorMessage)
    .replace('{snippet}', snippet)
    .replace('{ariaSnapshot}', ariaSnapshot);
}

/**
 * Escapes terminal colors from a string.
 * See: https://github.com/microsoft/playwright/blob/release-1.49/packages/playwright/src/reporters/base.ts#L491
 */
function stripAnsiEscapes(str: string): string {
  // eslint-disable-next-line max-len, no-control-regex
  const ansiRegex = new RegExp('([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))','g');
  return str.replace(ansiRegex, '');
}

/**
 * Get code snippet by the error stack.
 * See: https://github.com/microsoft/playwright/blob/release-1.49/packages/playwright/src/reporters/internalReporter.ts#L115
 */
function getCodeSnippet(error: TestInfoError) {
  const location = getErrorLocation(error);
  if (!location?.file || !location.line) return;

  try {
    const source = fs.readFileSync(location.file, 'utf8');
    const lines = source.split('\n');
    return lines.slice(location.line - 3, location.line + 4).join('\n');
  } catch (e) {
    // Failed to read the source file - that's ok.
  }
}
  
function getErrorLocation(error: TestInfoError) {
  const lines = (error.stack || '').split('\n');
  let firstStackLine = lines.findIndex(line => line.startsWith('    at '));
  if (firstStackLine === -1) firstStackLine = lines.length;
  const stackLines = lines.slice(firstStackLine);
  for (const line of stackLines) {
    const frame = parseStackTraceLine(line);
    if (!frame || !frame.file || frame.file.includes(`node_modules`)) continue;
    return { file: frame.file, column: frame.column || 0, line: frame.line || 0 };
  }
}
