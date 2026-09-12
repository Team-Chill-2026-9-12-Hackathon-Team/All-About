import { mkdir, writeFile } from "node:fs/promises";
import { collectPages, type BrowserSignal, type QueryPlan, type Scope } from "./index.js";

const scope: Scope = {
  school: "University of Toronto",
  campus: "UTSG",
  term: null,
  course: null,
  section: null,
  entity: "Labour Day Carillon Recital",
};

const plan: QueryPlan = {
  runId: `carillon-smoke-${Date.now()}`,
  input: {
    query: "When and where is the Labour Day Carillon Recital, and is it free?",
    scope,
    sourceIds: ["alumni-carillon-recital"],
    mode: "LIVE_WEB",
  },
  targets: [
    {
      id: "alumni-carillon-recital",
      kind: "official",
      label: "U of T Alumni — Labour Day Carillon Recital",
      entryUrl: "https://alumni.utoronto.ca/events/labour-day-carillon-recital-0",
      allowedHosts: ["alumni.utoronto.ca"],
      scope,
      contentMode: "live",
      access: "public",
    },
  ],
  requestedFields: ["event_date", "location", "eligibility", "event_description"],
  budget: { maxPages: 1, maxSteps: 6, timeoutMs: 75_000 },
};

const signals: BrowserSignal[] = [];
const started = Date.now();
const batch = await collectPages(
  plan,
  (event) => {
    signals.push(event);
    const safe =
      event.type === "session_ready"
        ? { type: event.type, viewerUrlReceived: true }
        : event.type === "page_read"
          ? {
              type: event.type,
              sourceId: event.snapshot.sourceId,
              title: event.snapshot.title,
              characters: event.snapshot.text.length,
              url: event.snapshot.url,
            }
          : event;
    console.log(JSON.stringify(safe));
  },
  new AbortController().signal,
);

const page = batch.pages[0];
const assertions = {
  oneDetailPage: batch.pages.length === 1,
  noFailures: batch.failures.length === 0,
  released: batch.cleanup === "released",
  viewerReceived: signals.some((event) => event.type === "session_ready"),
  namePresent: page?.text.includes("Labour Day Carillon Recital") === true,
  datePresent: page?.text.includes("September 7, 2026") === true,
  locationPresent: page?.text.includes("Hart House Circle") === true,
  singleEvent: page?.text.includes("Terry Fox") !== true,
};

const artifact = {
  kind: "campus_event_backup_not_student_club",
  runId: plan.runId,
  completedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  cleanup: batch.cleanup,
  failures: batch.failures,
  pages: batch.pages.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    url: item.url,
    title: item.title,
    fetchedAt: item.fetchedAt,
    characters: item.text.length,
    entity: item.scope.entity,
  })),
  assertions,
};

const output = new URL("../test/fixtures/", import.meta.url);
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(
  new URL("alumni-carillon-recital.live.json", output),
  JSON.stringify(
    {
      note: "Historical live Steel capture. Replay is not a new live run.",
      capturedAt: artifact.completedAt,
      sourceId: "alumni-carillon-recital",
      url: page?.url ?? null,
      snapshot: page ?? null,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);

const artifacts = new URL("../artifacts/", import.meta.url);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await writeFile(
  new URL("event-smoke-summary.json", artifacts),
  JSON.stringify(artifact, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify({ type: "complete", ...artifact }));
if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
