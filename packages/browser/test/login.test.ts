import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import type { SourceConfig } from "@allabout/contracts";

import { attemptCredentialLogin } from "../src/login.ts";

const target: SourceConfig = {
  id: "piazza-login",
  kind: "course_discussion",
  label: "Piazza",
  entryUrl: "https://piazza.com/login",
  allowedHosts: ["piazza.com"],
  scope: {
    school: "University of Toronto",
    campus: "UTSG",
    term: null,
    course: null,
    section: null,
    entity: null,
  },
  contentMode: "live",
  access: "authorized",
};

test("resolves credentials only for the exact current hostname", async () => {
  let requested = "";
  const page = { url: () => "https://piazza.com/login" } as Page;
  const result = await attemptCredentialLogin(
    page,
    target,
    async (hostname) => {
      requested = hostname;
      return null;
    },
    new AbortController().signal,
  );
  assert.equal(requested, "piazza.com");
  assert.deepEqual(result, { status: "credential_missing" });
});

test("does not resolve credentials after an unregistered cross-domain redirect", async () => {
  let called = false;
  const page = { url: () => "https://evil.example/login" } as Page;
  const result = await attemptCredentialLogin(
    page,
    target,
    async () => {
      called = true;
      return { username: "should-not", password: "be-used" };
    },
    new AbortController().signal,
  );
  assert.equal(called, false);
  assert.deepEqual(result, { status: "form_unsupported" });
});

test("fills and submits a supported same-origin login form", async () => {
  let currentUrl = "https://piazza.com/login";
  const filled: Record<string, string> = {};
  const form = {
    count: async () => 1,
    getAttribute: async () => "/login",
  };
  const username = {
    first() { return this; },
    count: async () => currentUrl.endsWith("/login") ? 1 : 0,
    fill: async (value: string) => { filled.username = value; },
  };
  const password = {
    first() { return this; },
    count: async () => currentUrl.endsWith("/login") ? 1 : 0,
    fill: async (value: string) => { filled.password = value; },
    locator: () => form,
    press: async () => { currentUrl = "https://piazza.com/dashboard"; },
  };
  const body = { innerText: async () => "Course dashboard" };
  const page = {
    url: () => currentUrl,
    locator: (selector: string) => selector === "body"
      ? body
      : selector === 'input[type="password"]:visible'
        ? password
        : username,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
  } as unknown as Page;

  const result = await attemptCredentialLogin(
    page,
    target,
    async () => ({ username: "student@example.edu", password: "private-password" }),
    new AbortController().signal,
  );
  assert.deepEqual(filled, {
    username: "student@example.edu",
    password: "private-password",
  });
  assert.deepEqual(result, {
    status: "authenticated",
    url: "https://piazza.com/dashboard",
  });
});
