import { describe, expect, it } from "vitest";

import { readServerConfig } from "../src/config.js";

describe("readServerConfig", () => {
  it("uses safe local defaults when optional values are absent", () => {
    expect(readServerConfig({})).toEqual({
      host: "127.0.0.1",
      port: 3_001,
      openAiApiKey: undefined,
      openAiModel: undefined,
      openAiConfigured: false,
    });
  });

  it("accepts server configuration without returning extra environment data", () => {
    const result = readServerConfig({
      HOST: "0.0.0.0",
      PORT: "3100",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
      UNRELATED_SECRET: "must-not-leak",
    });

    expect(result).toEqual({
      host: "0.0.0.0",
      port: 3_100,
      openAiApiKey: "test-key",
      openAiModel: "test-model",
      openAiConfigured: true,
    });
    expect(result).not.toHaveProperty("UNRELATED_SECRET");
  });

  it("rejects an invalid port", () => {
    expect(() => readServerConfig({ PORT: "70000" })).toThrow();
  });
});
