# Evidence engine

Minimal standalone D-module scaffold. It currently demonstrates:

- `buildAnswer(plan, batch, signal)`
- exact quote validation with whitespace normalization
- a basic date-only deadline extraction
- a replaceable `CandidateExtractor` interface for future model integration
- submission-format extraction
- explicit deadline-update and unresolved-conflict handling
- confirmed vs. needs-confirmation key dates
- source coverage reporting
- shared contract imports from `@allabout/contracts`

Run on Node.js 20+ from the repository workspace:

```bash
npm run smoke
npm test
```

The package now consumes B's shared v1 contract. Synthetic fixtures remain test-only.
