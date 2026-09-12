import type {
  AnswerBundle,
  BrowserBatch,
  BuildAnswer,
  CollectPages,
  PageSnapshot,
  QueryPlan,
} from "@allabout/contracts";

export function createMockCollectPages(
  customize?: (plan: QueryPlan, batch: BrowserBatch) => BrowserBatch,
): CollectPages {
  return async (plan, emit, signal) => {
    signal.throwIfAborted();
    const source = plan.targets[0];
    if (source === undefined) {
      return { pages: [], failures: [], cleanup: "not_created" };
    }
    const snapshot: PageSnapshot = {
      id: `snapshot-${plan.runId}`,
      sourceId: source.id,
      url: source.entryUrl,
      title: "Synthetic registration fixture",
      text: "Synthetic test fixture: registration opens September 15, 2026.",
      fetchedAt: "2026-09-12T16:00:00.000Z",
      publishedAt: null,
      updatedAt: null,
      scope: plan.input.scope,
      kind: source.kind,
      contentMode: "fixture",
    };
    emit({ type: "session_ready", viewerUrl: "https://viewer.example.test/session" });
    emit({ type: "step", sourceId: source.id, action: "read fixture", url: source.entryUrl });
    emit({ type: "page_read", snapshot });
    const batch: BrowserBatch = { pages: [snapshot], failures: [], cleanup: "released" };
    return customize?.(plan, batch) ?? batch;
  };
}

export function createMockBuildAnswer(
  customize?: (plan: QueryPlan, answer: AnswerBundle) => AnswerBundle,
): BuildAnswer {
  return async (plan, batch, signal) => {
    signal.throwIfAborted();
    const page = batch.pages[0];
    const evidence =
      page === undefined
        ? []
        : [
            {
              id: `evidence-${plan.runId}`,
              snapshotId: page.id,
              quote: "registration opens September 15, 2026",
              authority: "unknown" as const,
              authorityBasis: "Synthetic fixture used only by automated tests.",
            },
          ];
    const claims =
      page === undefined
        ? []
        : [
            {
              id: `claim-${plan.runId}`,
              field: "registration_date",
              text: "The synthetic registration date is September 15, 2026.",
              scope: plan.input.scope,
              nature: "fact" as const,
              status: "supported" as const,
              evidenceIds: evidence.map(({ id }) => id),
              dateValue: {
                precision: "date" as const,
                date: "2026-09-15",
                timezone: "America/Toronto",
              },
            },
          ];
    const answer: AnswerBundle = {
      schemaVersion: "1",
      runId: plan.runId,
      mode: plan.input.mode,
      scope: plan.input.scope,
      summary:
        page === undefined
          ? []
          : [
              {
                text: claims[0]?.text ?? "Synthetic fixture has no result.",
                claimIds: claims.map(({ id }) => id),
                evidenceIds: evidence.map(({ id }) => id),
              },
            ],
      requirements: [],
      communityNotes: [],
      unknowns: page === undefined ? ["No synthetic source was selected."] : [],
      claims,
      evidence,
      conflicts: [],
      keyDates:
        page === undefined
          ? []
          : [
              {
                id: `date-${plan.runId}`,
                label: "Synthetic registration date",
                value: {
                  precision: "date",
                  date: "2026-09-15",
                  timezone: "America/Toronto",
                },
                claimId: `claim-${plan.runId}`,
                evidenceIds: [`evidence-${plan.runId}`],
                status: "confirmed",
              },
            ],
      coverage: plan.targets.map(({ id }) => ({
        sourceId: id,
        status: page === undefined ? "not_checked" : "checked",
        reason: page === undefined ? "Synthetic fixture did not select a source." : null,
        snapshotIds: page === undefined ? [] : [page.id],
      })),
      sources: batch.pages.map(({ text: _text, ...publicSource }) => publicSource),
      generatedAt: "2026-09-12T16:00:01.000Z",
    };
    return customize?.(plan, answer) ?? answer;
  };
}
