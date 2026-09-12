import { describe, expect, it } from "vitest";

import { liveSourceRegistry } from "../src/source-registry.js";

describe("live source registry", () => {
  it("contains the two approved exact-host public sources", () => {
    expect(liveSourceRegistry.map(({ id }) => id)).toEqual([
      "academic-calendar-csc207",
      "uoft-events",
    ]);
    for (const source of liveSourceRegistry) {
      const entry = new URL(source.entryUrl);
      expect(entry.protocol).toBe("https:");
      expect(source.access).toBe("public");
      expect(source.contentMode).toBe("live");
      expect(source.allowedHosts).toEqual([entry.hostname]);
      expect(source.allowedHosts[0]).not.toContain("*");
    }
  });
});
