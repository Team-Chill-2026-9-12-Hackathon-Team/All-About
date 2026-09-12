import {
  EventEnvelopeSchema,
  QueryInputSchema,
  RunSnapshotSchema,
  type EventEnvelope,
} from "@allabout/contracts";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001");
const input = QueryInputSchema.parse({
  query: "When and where is the Labour Day Carillon Recital, and is it free?",
  scope: {
    school: "University of Toronto",
    campus: "UTSG",
    term: null,
    course: null,
    section: null,
    entity: "Labour Day Carillon Recital",
  },
  sourceIds: ["alumni-carillon-recital"],
  mode: "LIVE_WEB",
});

const healthResponse = await fetch(new URL("/api/health", baseUrl));
const sourcesResponse = await fetch(new URL("/api/sources", baseUrl));
const sourceIds = ((await sourcesResponse.json()) as Array<{ id: string }>).map(
  ({ id }) => id,
);

const createdResponse = await fetch(new URL("/api/runs", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(input),
});
const created = (await createdResponse.json()) as {
  runId?: string;
  eventsUrl?: string;
};

if (
  createdResponse.status !== 202 ||
  created.runId === undefined ||
  created.eventsUrl === undefined
) {
  console.error(
    JSON.stringify({
      type: "create_failed",
      status: createdResponse.status,
      body: created,
    }),
  );
  process.exitCode = 1;
} else {
  const eventsResponse = await fetch(new URL(created.eventsUrl, baseUrl));
  const events: EventEnvelope[] = (await eventsResponse.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => EventEnvelopeSchema.parse(JSON.parse(line.slice(6))));

  const final = RunSnapshotSchema.parse(
    await (await fetch(new URL(`/api/runs/${created.runId}`, baseUrl))).json(),
  );
  const fields = new Set(final.answer?.claims.map((claim) => claim.field) ?? []);
  const named =
    final.answer?.sources.some((source) => /carillon/i.test(source.title)) ===
    true;
  const quoteOk =
    final.answer === null ||
    final.answer.evidence.every((item) => item.quote.trim().length > 0);
  const expectedPartial =
    !fields.has("event_date") || !fields.has("location")
      ? final.status === "partial" || fields.size > 0
      : true;

  const assertions = {
    health: healthResponse.status === 200,
    sourceRegistered: sourceIds.includes("alumni-carillon-recital"),
    eventsOk: eventsResponse.status === 200,
    viewerReady: events.some(({ type }) => type === "viewer_ready"),
    sourceChecked: events.some(
      (event) =>
        event.type === "source_checked" &&
        event.payload.sourceId === "alumni-carillon-recital",
    ),
    noRunError: !events.some(({ type }) => type === "run_error"),
    terminal: ["completed", "partial", "failed", "cancelled"].includes(
      final.status,
    ),
    released: final.cleanup === "released",
    namedSource: named,
    quoteOk,
    honestIfMissingFields: expectedPartial,
    answerPresent: final.answer !== null,
  };

  console.log(
    JSON.stringify({
      type: "live_event_smoke_complete",
      eventTypes: events.map(({ type }) => type),
      final: {
        status: final.status,
        cleanup: final.cleanup,
        claims: final.answer?.claims.map((claim) => claim.field) ?? [],
        evidence: final.answer?.evidence.length ?? 0,
        unknowns: final.answer?.unknowns ?? [],
        sourceTitle: final.answer?.sources[0]?.title ?? null,
      },
      assertions,
    }),
  );
  if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
}
