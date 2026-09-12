# A · Frontend

## Start

```bash
cd apps/web
pnpm install
pnpm dev
```

Backend must already be on `127.0.0.1:3001`. Vite proxies `/api`.

## Wired events

`run_status`, `clarification_needed`, `viewer_ready`, `browser_step`, `source_checked`, `source_failed`, `answer_ready`, `viewer_closed`, `run_error`.

The desk posts `LIVE_WEB` queries. CSC207 questions pin `sourceIds: ["academic-calendar-csc207"]`.

## Not wired

- Browser back/forward (screens are in-app: login → tools → desk).
- Replay of expired in-memory runs after a server restart.
- Activity / exam sources in the starter list.
