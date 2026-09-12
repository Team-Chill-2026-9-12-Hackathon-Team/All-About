import {
  EventEnvelopeSchema,
  QueryInputSchema,
  RunSnapshotSchema,
  type EventEnvelope,
} from "@allabout/contracts";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001");
const input = QueryInputSchema.parse({
  query:
    "What is CSC207H1 Software Design and what are its prerequisites and requirements?",
  scope: {
    school: "University of Toronto",
    campus: "UTSG",
    term: null,
    course: "CSC207H1",
    section: null,
    entity: null,
  },
  sourceIds: ["academic-calendar-csc207"],
  mode: "LIVE_WEB",
});

const healthResponse = await fetch(new URL("/api/health", baseUrl));
const sourcesResponse = await fetch(new URL("/api/sources", baseUrl));
const sourceIds = ((await sourcesResponse.json()) as Array<{ id: string }>).map(
  ({ id }) => id,
);
console.log(
  JSON.stringify({
    type: "preflight",
    healthStatus: healthResponse.status,
    sourcesStatus: sourcesResponse.status,
    sourceIds,
  }),
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
  const eventText = await eventsResponse.text();
  const events: EventEnvelope[] = eventText
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => EventEnvelopeSchema.parse(JSON.parse(line.slice(6))));

  const finalResponse = await fetch(
    new URL(`/api/runs/${created.runId}`, baseUrl),
  );
  const final = RunSnapshotSchema.parse(await finalResponse.json());
  const assertions = {
    health: healthResponse.status === 200,
    sourceRegistered: sourceIds.includes("academic-calendar-csc207"),
    eventsOk: eventsResponse.status === 200,
    viewerReady: events.some(({ type }) => type === "viewer_ready"),
    sourceChecked: events.some(
      (event) =>
        event.type === "source_checked" &&
        event.payload.sourceId === "academic-calendar-csc207",
    ),
    noRunError: !events.some(({ type }) => type === "run_error"),
    terminal: ["completed", "partial", "failed", "cancelled"].includes(
      final.status,
    ),
    released: final.cleanup === "released",
    answerReady:
      final.answer !== null &&
      final.answer.claims.length > 0 &&
      final.answer.evidence.length > 0,
  };

  console.log(
    JSON.stringify({
      type: "live_smoke_complete",
      eventTypes: events.map(({ type }) => type),
      final: {
        status: final.status,
        cleanup: final.cleanup,
        lastSeq: final.lastSeq,
        claims: final.answer?.claims.length ?? 0,
        evidence: final.answer?.evidence.length ?? 0,
        unknowns: final.answer?.unknowns ?? [],
      },
      assertions,
    }),
  );

  if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
}
