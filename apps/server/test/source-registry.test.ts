import { describe, expect, it } from "vitest";

import { liveSourceRegistry } from "../src/source-registry.js";

describe("live source registry", () => {
  it("contains the approved exact-host public sources", () => {
    const authorizedSourceIds = new Set([
      "piazza-login",
      "quercus-login",
      "acorn-login",
    ]);
    expect(liveSourceRegistry.map(({ id }) => id)).toEqual([
      "academic-calendar-csc207",
      "academic-calendar-csc148",
      "uoft-events",
      "alumni-carillon-recital",
      "academic-calendar-sessional-dates",
      "cs-undergrad-courses",
      "reddit-uoft-csc207",
      "reddit-uoft",
      "piazza-login",
      "artsci-exam-conflicts",
      "hart-house-events",
      "student-life-events",
      "artsci-academic-dates",
      "timetable-builder",
      "the-varsity-about",
      "ulife-organizations",
      "quercus-login",
      "acorn-login",
    ]);
    for (const source of liveSourceRegistry) {
      const entry = new URL(source.entryUrl);
      expect(entry.protocol).toBe("https:");
      expect(source.access).toBe(
        authorizedSourceIds.has(source.id) ? "authorized" : "public",
      );
      expect(source.contentMode).toBe("live");
      expect(source.allowedHosts).toContain(entry.hostname);
      expect(source.allowedHosts.every((host) => !host.includes("*"))).toBe(true);
    }
  });
});
