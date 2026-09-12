# Evidence engine

Minimal standalone D-module scaffold. It currently demonstrates:

- `buildAnswer(plan, batch, signal)`
- exact quote validation with whitespace normalization
- a basic date-only deadline extraction
- a replaceable `CandidateExtractor` interface for future model integration
- submission-format extraction
- club activity fields: event date, location, registration link, organizer, description
- exact duplicate claims are merged while retaining all supporting sources
- explicit deadline-update and unresolved-conflict handling
- confirmed vs. needs-confirmation key dates
- source coverage reporting
- zero external runtime dependencies

Run on Node.js 24+:

```bash
npm run smoke
npm test
```

The types in `src/types.ts` are temporary. Replace them with imports from
`@allabout/contracts` after B publishes the shared package.
