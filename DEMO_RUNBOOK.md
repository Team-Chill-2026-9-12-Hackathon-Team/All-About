# AllAbout Campus Demo Runbook

Frozen on 2026-09-12. The UI must use the exact mode labels shown by the backend.

## Start and preflight

```bash
npm run dev
npm run demo:preflight
```

Open `http://127.0.0.1:5174`. The expected preflight is six passing checks: direct health, proxied health, one three-pass LIVE_WEB artifact, and three LIVE_FIXTURE artifacts.

## Primary 90-second path

1. Click **Demo · DEMO101 A2 deadline update**.
2. Say: “This is a real Steel browser session visiting three public pages whose course content is explicitly fictional.”
3. Point to `LIVE_FIXTURE` while the viewer is visible.
4. At the answer, show September 18 → September 20, the instructor update basis, and the late-penalty unknown.
5. Click citations 2, 3, and 5 to switch the Evidence Workspace across syllabus, instructor announcement, and student discussion.
6. Point to `Viewer released` and the three backend coverage receipts.

Expected duration from the last acceptance run: about 22 seconds. No manual intervention was needed in three consecutive runs.

## Real-web path

Click **Live · Carillon and Soldiers’ Tower**. Say: “This path browses two current U of T public pages. Both pages contribute supported facts.” The frozen acceptance artifact records three consecutive successful runs with 14 supported facts, one date, two contributing sources, and `cleanup=released`.

## Reset

Click **New task**. If a run is active, the UI waits for backend cancellation and Steel cleanup before clearing it. A server restart also clears the in-memory run store.

## Fallbacks

- If the public fictional pages cannot be reached, the same starter automatically changes to `LOCAL_FIXTURE`; say “bundled fictional demo data” and do not call it live browsing.
- If Steel or the network is unavailable, use `outputs/demo-replay-snapshot.json` as a read-only evidence backup. It is an archived API snapshot, not an interactive replay.
- If a source is blocked or requires MFA, show the blocked receipt or unknown. Do not say it was reviewed.

## Claims that are safe to make

- The primary fixture story and real Carillon story each ran successfully three consecutive times.
- Citations link claims to captured quotes from the same run.
- The backend validates execution mode, source content mode, evidence support, coverage, and cleanup state.

Do not claim autonomous MFA completion, arbitrary-course deadline coverage, production-grade replay, or a real DEMO101 course.
