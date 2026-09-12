import { buildAnswer } from "@allabout/evidence";
import { describe, expect, it } from "vitest";

import { collectFixturePages } from "../src/fixture-collect.js";
import { inheritParentQuery } from "../src/follow-up.js";
import { answerToIcs } from "../src/calendar.js";
import { demo101Sources } from "../src/demo101-fixtures.js";
import { createDefaultPlan } from "../src/run-executor.js";

const demoInput = {
  query: "Did the DEMO101 A2 deadline change?",
  scope: {
    school: "University of Toronto",
    campus: "UTSG",
    term: "Fall 2026",
    course: "DEMO101",
    section: null,
    entity: "Assignment 2",
  },
  sourceIds: ["demo101-syllabus", "demo101-announcement", "demo101-student-discussion"],
  mode: "LIVE_FIXTURE" as const,
};

describe("DEMO101 fixture detective", () => {
  it("marks the syllabus deadline superseded after the instructor extension", async () => {
    const plan = createDefaultPlan("run-demo101", demoInput, [...demo101Sources]);
    const batch = await collectFixturePages(plan, () => undefined, new AbortController().signal);
    const answer = await buildAnswer(plan, batch, new AbortController().signal);

    expect(answer.conflicts[0]).toMatchObject({
      field: "deadline",
      resolution: "explicit_update",
    });
    expect(answer.claims.filter((claim) => claim.field === "deadline").map((claim) => claim.status).sort()).toEqual([
      "superseded",
      "supported",
    ]);
    expect(answer.keyDates).toHaveLength(1);
    expect(answer.keyDates[0]).toMatchObject({ status: "confirmed" });
    expect(answer.communityNotes.length).toBeGreaterThan(0);
    expect(answer.unknowns.some((item) => /late penalty/i.test(item))).toBe(true);
    expect(answerToIcs(answer)).toMatch(/BEGIN:VEVENT/);
  });

  it("keeps the parent course when a follow-up omits it", () => {
    const followUp = inheritParentQuery(
      {
        query: "What about the late penalty?",
        scope: {
          school: "University of Toronto",
          campus: "UTSG",
          term: null,
          course: null,
          section: null,
          entity: null,
        },
        mode: "LIVE_WEB",
        parentRunId: "run-demo101",
      },
      demoInput,
    );
    expect(followUp.scope.course).toBe("DEMO101");
    expect(followUp.scope.entity).toBe("Assignment 2");
    expect(followUp.mode).toBe("LIVE_FIXTURE");
    expect(followUp.sourceIds).toEqual(demoInput.sourceIds);
  });
});
