# @allabout/contracts

Shared runtime schemas and TypeScript types for AllAbout Campus. Zod schemas are the source of truth; TypeScript types are inferred from them.

## Use

```ts
import {
  AnswerBundleSchema,
  QueryInputSchema,
  type AnswerBundle,
  type CollectPages,
} from "@allabout/contracts";
```

Validate every HTTP boundary, C/D adapter result, and persisted event before using it. The schemas validate structure. Cross-reference checks such as evidence-to-snapshot membership and quote matching belong to B4; semantic support, authority, scope, and conflict correctness remain D's responsibility.

## Examples

- `examples/query-input.json`: A → B input.
- `examples/query-plan.json`: B → C/D plan.
- `examples/browser-batch.json`: C → B/D page batch.
- `examples/answer-bundle.json`: D → B → A result.
- `examples/events.json`: clarification, completed, partial, error, and cancelled event envelopes.

All sample course content is fictional and marked with `LIVE_FIXTURE` / `fixture`. It is not evidence of a real UTSG course or integration.

## Contract status

Schema version `1` implements the agreed draft without the unresolved extensions below. Team confirmation is still required before adding:

- A cleanup lifecycle signal and cleanup field on the run status response.
- A development-only mock mode exposed through HTTP/UI.
- A faculty/college field in `Scope`; the P0 schema currently represents UTSG-wide, course, section, and entity scope without that extra dimension.

When proposing a change, include the field or behavior, reason, consumer impact, JSON example, owner approvals, and schema version impact.
