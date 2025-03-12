/**
 * Fix with AI attachment to failed Playwright tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Page, TestInfo, TestInfoError } from '@playwright/test';

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
`;

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
    .replace('{ariaSnapshot}', ariaSnapshot)
    .trim();
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
    const frame = parseStackFrame(line, path.sep, false);
    if (!frame || !frame.file || frame.file.includes(`node_modules`)) continue;
    return { file: frame.file, column: frame.column || 0, line: frame.line || 0 };
  }
}

type StackFrame = {
  file: string;
  line: number;
  column: number;
  function?: string;
};

/**
 * See: https://github.com/microsoft/playwright/blob/release-1.51/packages/playwright-core/src/utils/isomorphic/stackTrace.ts
 */
function parseStackFrame(
  text: string,
  pathSeparator: string,
  showInternalStackFrames: boolean,
): StackFrame | null {
  const match = text && text.match(re);
  if (!match) return null;

  let fname = match[2];
  let file = match[7];
  if (!file) return null;
  if (!showInternalStackFrames && (file.startsWith('internal') || file.startsWith('node:')))
    return null;

  const line = match[8];
  const column = match[9];
  const closeParen = match[11] === ')';

  const frame: StackFrame = {
    file: '',
    line: 0,
    column: 0,
  };

  if (line) frame.line = Number(line);

  if (column) frame.column = Number(column);

  if (closeParen && file) {
    // make sure parens are balanced
    // if we have a file like "asdf) [as foo] (xyz.js", then odds are
    // that the fname should be += " (asdf) [as foo]" and the file
    // should be just "xyz.js"
    // walk backwards from the end to find the last unbalanced (
    let closes = 0;
    for (let i = file.length - 1; i > 0; i--) {
      if (file.charAt(i) === ')') {
        closes++;
      } else if (file.charAt(i) === '(' && file.charAt(i - 1) === ' ') {
        closes--;
        if (closes === -1 && file.charAt(i - 1) === ' ') {
          const before = file.slice(0, i - 1);
          const after = file.slice(i + 1);
          file = after;
          fname += ` (${before}`;
          break;
        }
      }
    }
  }

  if (fname) {
    const methodMatch = fname.match(methodRe);
    if (methodMatch) fname = methodMatch[1];
  }

  if (file) {
    if (file.startsWith('file://')) file = fileURLToPath(file, pathSeparator);
    frame.file = file;
  }

  if (fname) frame.function = fname;

  return frame;
}

const re = new RegExp(
  '^' +
    // Sometimes we strip out the '    at' because it's noisy
    '(?:\\s*at )?' +
    // $1 = ctor if 'new'
    '(?:(new) )?' +
    // $2 = function name (can be literally anything)
    // May contain method at the end as [as xyz]
    '(?:(.*?) \\()?' +
    // (eval at <anonymous> (file.js:1:1),
    // $3 = eval origin
    // $4:$5:$6 are eval file/line/col, but not normally reported
    '(?:eval at ([^ ]+) \\((.+?):(\\d+):(\\d+)\\), )?' +
    // file:line:col
    // $7:$8:$9
    // $10 = 'native' if native
    '(?:(.+?):(\\d+):(\\d+)|(native))' +
    // maybe close the paren, then end
    // if $11 is ), then we only allow balanced parens in the filename
    // any imbalance is placed on the fname.  This is a heuristic, and
    // bound to be incorrect in some edge cases.  The bet is that
    // having weird characters in method names is more common than
    // having weird characters in filenames, which seems reasonable.
    '(\\)?)$',
);

const methodRe = /^(.*?) \[as (.*?)\]$/;

function fileURLToPath(fileUrl: string, pathSeparator: string): string {
  if (!fileUrl.startsWith('file://')) return fileUrl;

  let path = decodeURIComponent(fileUrl.slice(7));
  if (path.startsWith('/') && /^[a-zA-Z]:/.test(path.slice(1))) path = path.slice(1);

  return path.replace(/\//g, pathSeparator);
}
