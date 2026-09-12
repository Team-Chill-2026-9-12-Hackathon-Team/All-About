# B minimum demo test plan

Date: 2026-09-12.

This plan implements the user's instruction in `TEAM_MIN_DEMO_B.md`. Statements
that describe dependency status are still verified before being recorded as test
evidence.

## Readiness snapshot

Ready now:

- `@allabout/browser` and `@allabout/evidence` are imported through their public
  package entry points by `createRunRuntime`.
- The application model is configured outside source control as `gpt-5-mini`.
- Query planning uses factual requested-field names. D currently extracts
  `deadline` and `submission_format`; unsupported fields remain unknown rather
  than being invented.
- An unconfigured production server keeps `/api/health` available and rejects
  `POST /api/runs` with `503 RUN_EXECUTION_UNAVAILABLE` before creating a queued
  run.
- `min-demo-preflight.test.ts` covers HTTP creation, automatic B execution, a
  synthetic C fixture, the real D entry point, boundary validation, a terminal
  answer, and late SSE replay. Its mode is `LIVE_FIXTURE`, never `LIVE_WEB`.

Not ready for a local live claim:

- `STEEL_API_KEY` is not present in the local ignored `.env`.
- The production registry contains the instructed CSC207 Academic Calendar
  primary source and U of T Events secondary source.
- `RunSnapshot.cleanup` records C's cleanup result, including after terminal
  cancellation, and late SSE replay suppresses an expired `viewer_ready` URL.
- A local Steel run has not yet verified either candidate page.

## Candidate-source check

Both exact HTTPS URLs were publicly reachable on 2026-09-12:

- `https://artsci.calendar.utoronto.ca/course/csc207h1` exposes the CSC207H1
  description, prerequisite, exclusion, and breadth requirement.
- `https://www.utoronto.ca/events` exposes a current U of T events listing.

This reachability check does not substitute for the Steel test. The registry must
use only `artsci.calendar.utoronto.ca` and `www.utoronto.ca` as exact allowed
hosts. It must not use a wildcard host.

## Test sequence

### 1. Offline regression and synthetic preflight

Run from the repository root:

```powershell
npm install
npm run typecheck
npm test
```

Pass conditions:

- all workspaces typecheck;
- existing unit/integration tests pass;
- the minimum-demo preflight reaches `completed` and its SSE history contains
  `viewer_ready`, `source_checked`, `viewer_closed`, and `answer_ready`;
- the public source response does not expose `entryUrl`.

### 2. Degraded production startup

Before the registry is enabled, run:

```powershell
npm run dev:server
curl.exe -s http://127.0.0.1:3001/api/health
curl.exe -s http://127.0.0.1:3001/api/sources
```

Expected now: health is `{ "ok": true }`, sources are empty, and a valid POST to
`/api/runs` returns 503 rather than leaving a run queued. This is a dependency
failure check, not the final demo acceptance result.

### 3. Live Steel preflight

Prerequisites:

- `STEEL_API_KEY` is added to the ignored root `.env` from a user-provided file;
- `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5-mini` remain configured;
- the confirmed exact-host registry is injected into the production entry point.

Run one source first. Observe the SSE stream and require:

- `viewer_ready` occurs only after a Steel session exists;
- at least one `source_checked` or a specific `source_failed` occurs;
- the run reaches `completed`, `partial`, or `failed`, never permanent `queued`;
- terminal output contains `answer_ready` or a structured `run_error`;
- no API key, CDP URL, or viewer URL appears in logs or Git changes;
- the remote session is released, or `release_failed` is reported honestly.

With the integrated server already running, execute the redacted harness:

```sh
npm run smoke:live --workspace @allabout/server
```

Set `SMOKE_BASE_URL=http://127.0.0.1:5173` to verify the frontend Vite proxy as
well. The harness never prints `viewerUrl`; it fails until both the transport
assertions and at least one supported claim/evidence pair are present.

Only after the one-source run is repeatable should the second source be enabled.
Record three consecutive run outcomes, durations, source failures, and cleanup
results without credentials or viewer URLs.

## Decisions required before step 3

1. Provide the filesystem path containing `STEEL_API_KEY`; do not paste the key
   into chat.
2. Run and record the instructed CSC207 Academic Calendar source first; enable U
   of T Events second because it may time out and should degrade to partial.
