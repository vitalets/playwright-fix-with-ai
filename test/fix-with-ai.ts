/**
 * Helper functions to add Fix with AI attachment to the failed playwright test.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import StackUtils from 'stack-utils';
import { TestInfoError } from '@playwright/test';

const stackUtils = new StackUtils({ internals: StackUtils.nodeInternals() });

const promptTemplate = `
You are an expert in Playwright testing. 
Fix the error in the Playwright test "{title}". 
- Provide response as diff formatted code snippet.
- Strictly rely on the ARIA snapshot of the page.
- Avoid adding any new code.
- Avoid adding comments to the code.
- Avoid changing the test logic.
- Use only role-based locators: getByRole, getByLabel, etc.
- Add concise note about applied changes.
- If the test may be correct and there is a bug in the page, note it.

{error}

Code snippet of the failing test:

{snippet}

ARIA snapshot of the page:
{ariaSnapshot}
`.trim();

/**
 * Builds AI prompt to fix error in Playwright test.
 */
export function buildPrompt({ title, error, ariaSnapshot }: { 
    title: string, 
    error: TestInfoError, 
    ariaSnapshot: string
}) {
  const errorMessage = error.message;
  const snippet = getCodeSnippet(error);

  if (!errorMessage || !snippet) return '';

  return promptTemplate
    .replace('{title}', title)
    .replace('{error}', stripAnsiEscapes(errorMessage))
    .replace('{snippet}', snippet)
    .replace('{ariaSnapshot}', ariaSnapshot);
}

/**
 * Escapes terminal colors from a string.
 * Extracted from Playwright.
 * See: https://github.com/microsoft/playwright/blob/release-1.49/packages/playwright/src/reporters/base.ts#L491
 */
function stripAnsiEscapes(str: string): string {
  // eslint-disable-next-line max-len, no-control-regex
  const ansiRegex = new RegExp('([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))','g');
  return str.replace(ansiRegex, '');
}

/**
 * Get code snippet by the error stack.
 * Extracted from Playwright:
 * https://github.com/microsoft/playwright/blob/release-1.49/packages/playwright/src/reporters/internalReporter.ts#L115
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
    if (!frame || !frame.file) continue;
    if (belongsToNodeModules(frame.file)) continue;
    return { file: frame.file, column: frame.column || 0, line: frame.line || 0 };
  }
}

function belongsToNodeModules(file: string) {
  return file.includes(`${path.sep}node_modules${path.sep}`);
}

/**
 * Parses stack trace line.
 * See in Playwright: 
 * https://github.com/microsoft/playwright/blob/release-1.49/packages/playwright-core/src/utilsBundle.ts#L47
 * 
 * Example:
 * "    at someFunction (/path/to/file.js:10:15)" -> { file: '/path/to/file.js', line: 10, column: 15 }
 */
function parseStackTraceLine(line: string) {
  const frame = stackUtils.parseLine(line);
  if (!frame)
    return null;
  if (!process.env.PWDEBUGIMPL && (frame.file?.startsWith('internal') || frame.file?.startsWith('node:')))
    return null;
  if (!frame.file)
    return null;
  // ESM files return file:// URLs, see here: https://github.com/tapjs/stack-utils/issues/60
  const file = frame.file.startsWith('file://') ? url.fileURLToPath(frame.file) : path.resolve(process.cwd(), frame.file);
  return {
    file,
    line: frame.line || 0,
    column: frame.column || 0,
    function: frame.function,
  };
}