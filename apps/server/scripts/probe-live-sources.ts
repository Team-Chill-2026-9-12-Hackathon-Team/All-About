import { collectPages } from "@allabout/browser";
import { type QueryInput, QueryPlanSchema } from "@allabout/contracts";

import { loadRootEnvironment } from "../src/config.js";
import { createDefaultPlan } from "../src/run-executor.js";
import { liveSourceRegistry } from "../src/source-registry.js";

loadRootEnvironment();

const input: QueryInput = {
  query: "When is the Labour Day Carillon Recital, where is it, and who can attend?",
  scope: {
    school: "University of Toronto", campus: "UTSG", term: null, course: null,
    section: null, entity: "Labour Day Carillon Recital",
  },
  sourceIds: ["alumni-carillon-recital", "soldiers-tower-features"],
  mode: "LIVE_WEB",
};
const base = createDefaultPlan(`probe-${Date.now()}`, input, liveSourceRegistry);
const plan = QueryPlanSchema.parse({
  ...base,
  requestedFields: ["event_name", "event_date", "event_time", "location", "eligibility", "event_description"],
  budget: {...base.budget, maxPages: 2, maxSteps: 10, timeoutMs: 90_000},
});
const batch = await collectPages(plan, () => undefined, new AbortController().signal);
console.log(JSON.stringify({
  cleanup: batch.cleanup,
  failures: batch.failures,
  pages: batch.pages.map((page) => ({
    sourceId: page.sourceId,
    url: page.url,
    title: page.title,
    publishedAt: page.publishedAt,
    updatedAt: page.updatedAt,
    excerpt: page.text.slice(0, 4_000),
  })),
}, null, 2));
