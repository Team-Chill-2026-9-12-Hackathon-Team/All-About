import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAllowedUrl, looksBlocked, looksLikeAuthentication } from '../src/page-tools.ts';
import { collectPages, type QueryPlan } from '../src/index.ts';

test('allows only an exact registered HTTPS host', () => {
  assert.equal(
    assertAllowedUrl('https://harthouse.ca/events/example', ['harthouse.ca']).hostname,
    'harthouse.ca',
  );
  assert.throws(
    () => assertAllowedUrl('https://evil.harthouse.ca/events/example', ['harthouse.ca']),
    /not registered/,
  );
  assert.throws(
    () => assertAllowedUrl('http://harthouse.ca/events/example', ['harthouse.ca']),
    /HTTPS/,
  );
  assert.throws(
    () => assertAllowedUrl('https://localhost/admin', ['localhost']),
    /not allowed/,
  );
  assert.throws(
    () => assertAllowedUrl('https://127.0.0.1/admin', ['127.0.0.1']),
    /not allowed/,
  );
  assert.throws(
    () => assertAllowedUrl('https://192.168.1.2/admin', ['192.168.1.2']),
    /not allowed/,
  );
});

test('distinguishes access checks and login redirects', () => {
  assert.equal(looksBlocked(200, 'Just a moment...', 'Verifying you are human'), true);
  assert.equal(looksBlocked(403, 'Forbidden', ''), true);
  assert.equal(
    looksBlocked(200, 'Real event', `${'useful event content '.repeat(150)}access denied parking notice`),
    false,
  );
  assert.equal(looksLikeAuthentication(200, 'https://weblogin.utoronto.ca/'), true);
  assert.equal(looksLikeAuthentication(200, 'https://harthouse.ca/events/example'), false);
});

test('a pre-cancelled run does not create a Steel session', async () => {
  const controller = new AbortController();
  controller.abort();
  const scope = {
    school: 'University of Toronto', campus: 'St. George', term: null,
    course: null, section: null, entity: 'test',
  };
  const plan: QueryPlan = {
    runId: 'cancelled-test',
    input: { query: 'test', scope, mode: 'LIVE_WEB' },
    targets: [{
      id: 'one', kind: 'official', label: 'one', entryUrl: 'https://example.com',
      allowedHosts: ['example.com'], scope, contentMode: 'live', access: 'public',
    }],
    requestedFields: ['test'],
    budget: { maxPages: 1, maxSteps: 2, timeoutMs: 1_000 },
  };
  const events: string[] = [];
  const batch = await collectPages(plan, (event) => events.push(event.type), controller.signal);
  assert.deepEqual(batch, {
    pages: [],
    failures: [{ sourceId: 'one', code: 'CANCELLED', message: 'The browser run was cancelled.', retryable: true }],
    cleanup: 'not_created',
  });
  assert.deepEqual(events, ['source_failed']);
});

import { fallbackUrlFor, shouldUseFallback } from '../src/fallbacks.ts';

test('blocked campus sites have a public fallback', () => {
  assert.equal(fallbackUrlFor('hart-house-events', 'https://harthouse.ca/events/month'), 'https://www.utoronto.ca/events');
  assert.equal(fallbackUrlFor('artsci-academic-dates', 'https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates'), 'https://artsci.calendar.utoronto.ca/sessional-dates');
  assert.equal(fallbackUrlFor('reddit-uoft', 'https://old.reddit.com/r/UofT/'), null);
  assert.equal(shouldUseFallback('ACCESS_BLOCKED'), true);
  assert.equal(shouldUseFallback('AUTH_REQUIRED'), false);
});
