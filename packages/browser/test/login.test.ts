import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { credentialForHost, fillLoginForm, hostsMatch } from '../src/login.ts';

test('matches a stored host to the live page host', () => {
  assert.equal(hostsMatch('piazza.com', 'www.piazza.com'), true);
  assert.equal(hostsMatch('q.utoronto.ca', 'www.acorn.utoronto.ca'), false);
  assert.equal(
    credentialForHost([{ host: 'piazza.com', username: 'ada', password: 'x' }], 'www.piazza.com')?.username,
    'ada',
  );
});

test('fills a local login form and leaves the wall', async (t) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip('Playwright Chromium is not installed in this environment.');
    return;
  }
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <form action="about:blank">
        <input name="email" type="email" />
        <input name="password" type="password" />
        <button type="submit">Log in</button>
      </form>
      <script>
        document.querySelector('form').addEventListener('submit', (event) => {
          event.preventDefault();
          const email = document.querySelector('input[name="email"]').value;
          const password = document.querySelector('input[name="password"]').value;
          if (email === 'student@utoronto.ca' && password === 'campus-pass') {
            document.body.innerHTML = '<main><h1>Course home</h1><p>${'Visible course notice '.repeat(20)}</p></main>';
          }
        });
      </script>
    `);
    const ok = await fillLoginForm(
      page,
      { host: 'example.test', username: 'student@utoronto.ca', password: 'campus-pass' },
      new AbortController().signal,
    );
    assert.equal(ok, true);
    assert.match(await page.innerText('body'), /Course home/);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
  } finally {
    await browser.close();
  }
});
