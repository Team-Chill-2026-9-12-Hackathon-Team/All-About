import {
  AnswerBundleSchema,
  type AnswerBlock,
  type AnswerBundle,
  type BrowserBatch,
  type QueryPlan,
  type Scope,
} from "@allabout/contracts";

export class AnswerValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Answer bundle failed boundary validation: ${issues.join("; ")}`);
  }
}

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function sameScope(left: Scope, right: Scope): boolean {
  return Object.keys(left).every(
    (key) => left[key as keyof Scope] === right[key as keyof Scope],
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-CA");
}

function validateBlocks(
  label: string,
  blocks: AnswerBlock[],
  claimIds: Set<string>,
  evidenceIds: Set<string>,
  issues: string[],
): void {
  for (const [index, block] of blocks.entries()) {
    for (const claimId of block.claimIds) {
      if (!claimIds.has(claimId)) issues.push(`${label}[${index}] references unknown claim ${claimId}`);
    }
    for (const evidenceId of block.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(`${label}[${index}] references unknown evidence ${evidenceId}`);
      }
    }
  }
}

export function validateAnswerBundle(
  plan: QueryPlan,
  batch: BrowserBatch,
  candidate: unknown,
): AnswerBundle {
  const answer = AnswerBundleSchema.parse(candidate);
  const issues: string[] = [];
  if (answer.runId !== plan.runId) issues.push("runId does not match the active run");
  if (answer.mode !== plan.input.mode) issues.push("mode does not match the query input");
  if (!sameScope(answer.scope, plan.input.scope)) issues.push("bundle scope does not match the query input");

  const collections = {
    claim: answer.claims.map(({ id }) => id),
    evidence: answer.evidence.map(({ id }) => id),
    conflict: answer.conflicts.map(({ id }) => id),
    keyDate: answer.keyDates.map(({ id }) => id),
    sourceSnapshot: answer.sources.map(({ id }) => id),
  };
  for (const [label, ids] of Object.entries(collections)) {
    for (const id of duplicateIds(ids)) issues.push(`duplicate ${label} ID ${id}`);
  }

  const claimIds = new Set(collections.claim);
  const evidenceIds = new Set(collections.evidence);
  const snapshotById = new Map(batch.pages.map((page) => [page.id, page]));
  const targetIds = new Set(plan.targets.map(({ id }) => id));
  for (const page of batch.pages) {
    if (!targetIds.has(page.sourceId)) {
      issues.push(`browser batch contains unplanned source ${page.sourceId}`);
    }
  }

  for (const claim of answer.claims) {
    if (!sameScope(claim.scope, plan.input.scope)) {
      issues.push(`claim ${claim.id} scope does not match the query input`);
    }
    if (claim.status === "supported" && claim.evidenceIds.length === 0) {
      issues.push(`supported claim ${claim.id} has no evidence`);
    }
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(`claim ${claim.id} references unknown evidence ${evidenceId}`);
      }
    }
  }

  for (const evidence of answer.evidence) {
    const snapshot = snapshotById.get(evidence.snapshotId);
    if (snapshot === undefined) {
      issues.push(`evidence ${evidence.id} references a snapshot outside this run`);
    } else if (!normalizeText(snapshot.text).includes(normalizeText(evidence.quote))) {
      issues.push(`evidence ${evidence.id} quote is absent from its snapshot text`);
    }
  }

  for (const conflict of answer.conflicts) {
    for (const claimId of conflict.claimIds) {
      if (!claimIds.has(claimId)) issues.push(`conflict ${conflict.id} references unknown claim ${claimId}`);
    }
    for (const evidenceId of conflict.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(`conflict ${conflict.id} references unknown evidence ${evidenceId}`);
      }
    }
    if (
      conflict.selectedClaimId !== null &&
      !conflict.claimIds.includes(conflict.selectedClaimId)
    ) {
      issues.push(`conflict ${conflict.id} selects a claim outside the conflict`);
    }
  }

  for (const keyDate of answer.keyDates) {
    if (!claimIds.has(keyDate.claimId)) {
      issues.push(`key date ${keyDate.id} references unknown claim ${keyDate.claimId}`);
    }
    for (const evidenceId of keyDate.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(`key date ${keyDate.id} references unknown evidence ${evidenceId}`);
      }
    }
  }

  for (const coverage of answer.coverage) {
    if (!targetIds.has(coverage.sourceId)) {
      issues.push(`coverage references unplanned source ${coverage.sourceId}`);
    }
    for (const snapshotId of coverage.snapshotIds) {
      const snapshot = snapshotById.get(snapshotId);
      if (snapshot === undefined) {
        issues.push(`coverage for ${coverage.sourceId} references an unknown snapshot ${snapshotId}`);
      } else if (snapshot.sourceId !== coverage.sourceId) {
        issues.push(`coverage for ${coverage.sourceId} references another source's snapshot ${snapshotId}`);
      }
    }
  }

  for (const source of answer.sources) {
    const snapshot = snapshotById.get(source.id);
    if (snapshot === undefined) {
      issues.push(`public source ${source.id} does not match a snapshot from this run`);
      continue;
    }
    const { text: _text, ...expectedSource } = snapshot;
    if (JSON.stringify(source) !== JSON.stringify(expectedSource)) {
      issues.push(`public source ${source.id} differs from its browser snapshot`);
    }
  }

  validateBlocks("summary", answer.summary, claimIds, evidenceIds, issues);
  validateBlocks("requirements", answer.requirements, claimIds, evidenceIds, issues);
  validateBlocks("communityNotes", answer.communityNotes, claimIds, evidenceIds, issues);

  if (issues.length > 0) throw new AnswerValidationError(issues);
  return answer;
}
