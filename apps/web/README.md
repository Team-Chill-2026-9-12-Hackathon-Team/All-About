# AllAbout Campus — Web

Frontend for the AllAbout Campus demo. Login and My Tools are local UI. The campus desk talks to B over `/api` and shows C’s read-only Steel viewer.

## Run locally

```bash
# terminal 1, repo root — backend with Steel + OpenAI configured
npm run start --workspace @allabout/server

# terminal 2
cd apps/web
pnpm install
pnpm dev
```

Vite runs on the fixed address `http://127.0.0.1:5174` and proxies `/api` to `http://127.0.0.1:3001`. From the repository root, `npm run dev` starts both services and `npm run check:local` verifies the direct backend and the frontend proxy.

## Checks

```bash
pnpm test
pnpm build
```

## Live desk

- `POST /api/runs` with `mode: LIVE_WEB`
- SSE at `GET /api/runs/:id/events`
- Right pane uses `viewer_ready.viewerUrl` (`interactive: false`)
- History restore never starts a new Steel session
