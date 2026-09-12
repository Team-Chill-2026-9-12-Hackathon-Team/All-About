import type { Claim, Conflict, Evidence, KeyDate, PageSnapshot } from "@allabout/contracts";

function scopeKey(claim: Claim): string {
  return JSON.stringify(claim.scope);
}

function dateKey(claim: Claim): string | null {
  if (!claim.dateValue) return null;
  return JSON.stringify(claim.dateValue);
}

function isExplicitUpdate(claim: Claim, evidenceById: Map<string, Evidence>): boolean {
  return claim.evidenceIds.some((id) => {
    const item = evidenceById.get(id);
    if (!item || item.authority !== "instructor") return false;
    return /\b(?:extend(?:ed)?|postpone(?:d)?|reschedule(?:d)?|moved?\s+to|new deadline)\b/i.test(item.quote);
  });
}

export function resolveConflicts(
  claims: Claim[],
  evidence: Evidence[],
  _snapshots: PageSnapshot[],
): { claims: Claim[]; conflicts: Conflict[]; keyDates: KeyDate[] } {
  const resolved = claims.map((claim) => ({ ...claim }));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const groups = new Map<string, Claim[]>();

  for (const claim of resolved) {
    if (!claim.dateValue) continue;
    const key = `${claim.field}:${scopeKey(claim)}`;
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }

  const conflicts: Conflict[] = [];
  for (const group of groups.values()) {
    const distinctDates = new Set(group.map(dateKey));
    if (distinctDates.size < 2) continue;

    const updates = group.filter((claim) => isExplicitUpdate(claim, evidenceById));
    if (updates.length === 1) {
      const selected = updates[0]!;
      for (const claim of group) claim.status = claim.id === selected.id ? "supported" : "superseded";
      conflicts.push({
        id: `conflict-${conflicts.length + 1}`,
        claimIds: group.map((claim) => claim.id),
        field: selected.field,
        resolution: "explicit_update",
        selectedClaimId: selected.id,
        explanation: "A supported source explicitly states that the earlier value was updated.",
        evidenceIds: [...new Set(group.flatMap((claim) => claim.evidenceIds))],
      });
    } else {
      for (const claim of group) claim.status = "conflict";
      conflicts.push({
        id: `conflict-${conflicts.length + 1}`,
        claimIds: group.map((claim) => claim.id),
        field: group[0]!.field,
        resolution: "unresolved",
        selectedClaimId: null,
        explanation: "The sources disagree and no explicit update relationship was found.",
        evidenceIds: [...new Set(group.flatMap((claim) => claim.evidenceIds))],
      });
    }
  }

  const keyDates: KeyDate[] = resolved
    .filter((claim) => claim.dateValue && claim.nature === "fact" && claim.status !== "superseded")
    .map((claim, index) => ({
      id: `key-date-${index + 1}`,
      label: claim.field,
      value: claim.dateValue!,
      claimId: claim.id,
      evidenceIds: claim.evidenceIds,
      status: claim.status === "supported" && claim.dateValue!.precision !== "unknown" && claim.evidenceIds.some((id) => {
        const authority = evidenceById.get(id)?.authority;
        return authority === "institution" || authority === "instructor" || authority === "ta";
      }) ? "confirmed" : "needs_confirmation",
    }));

  return { claims: resolved, conflicts, keyDates };
}
