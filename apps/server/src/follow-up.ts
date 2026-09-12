import type { QueryInput, Scope } from "@allabout/contracts";

export function inheritParentQuery(input: QueryInput, parent: QueryInput): QueryInput {
  const scope = { ...input.scope };
  for (const key of Object.keys(scope) as (keyof Scope)[]) {
    if (scope[key] == null && parent.scope[key] != null) {
      scope[key] = parent.scope[key];
    }
  }
  return {
    ...input,
    scope,
    mode: parent.mode,
    ...(parent.sourceIds ? { sourceIds: parent.sourceIds } : input.sourceIds ? { sourceIds: input.sourceIds } : {}),
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
  };
}
