import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import type { SourceConfig } from "@allabout/contracts";

import { attemptCredentialLogin, loginHostsFor } from "../src/login.ts";

const piazza: SourceConfig = {
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

const quercus: SourceConfig = {
  ...piazza,
  id: "quercus-login",
  kind: "official",
  label: "Quercus",
  entryUrl: "https://q.utoronto.ca/",
  allowedHosts: ["q.utoronto.ca"],
};

function fakePage(options: {
  url: string;
  action?: string | null;
  afterSubmitUrl?: string;
  afterSubmitBody?: string;
}): Page {
  let currentUrl = options.url;
  const form = {
    count: async () => 1,
    getAttribute: async () => options.action === undefined ? "/login" : options.action,
  };
  const username = {
    first() { return this; },
    count: async () => 1,
    fill: async () => undefined,
  };
  const password = {
    first() { return this; },
    count: async () => currentUrl.includes("dashboard") || currentUrl.includes("duo") ? 0 : 1,
    fill: async () => undefined,
    locator: () => form,
    press: async () => {
      currentUrl = options.afterSubmitUrl ?? "https://piazza.com/dashboard";
    },
  };
  const body = {
    innerText: async () => options.afterSubmitBody ?? "Course dashboard",
  };
  return {
    url: () => currentUrl,
    locator: (selector: string) => selector === "body"
      ? body
      : selector === 'input[type="password"]:visible'
        ? password
        : username,
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
  } as unknown as Page;
}

test("lists UofT SSO hosts only for campus login sources", () => {
  assert.deepEqual(loginHostsFor(piazza), [
    "piazza.com",
    "idpz.utorauth.utoronto.ca",
    "weblogin.utoronto.ca",
  ]);
  assert.deepEqual(loginHostsFor(quercus), [
    "q.utoronto.ca",
    "idpz.utorauth.utoronto.ca",
    "weblogin.utoronto.ca",
    "www.acorn.utoronto.ca",
  ]);
});

test("resolves a missing credential against the source login hosts", async () => {
  const requested: string[] = [];
  const result = await attemptCredentialLogin(
    fakePage({ url: "https://piazza.com/login" }),
    piazza,
    async (hostname) => {
      requested.push(hostname);
      return null;
    },
    new AbortController().signal,
  );
  assert.deepEqual(requested, [
    "piazza.com",
    "idpz.utorauth.utoronto.ca",
    "weblogin.utoronto.ca",
  ]);
  assert.deepEqual(result, { status: "credential_missing" });
});

test("does not resolve credentials after an unregistered cross-domain redirect", async () => {
  let called = false;
  const result = await attemptCredentialLogin(
    { url: () => "https://evil.example/login" } as Page,
    piazza,
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
  const result = await attemptCredentialLogin(
    fakePage({ url: "https://piazza.com/login" }),
    piazza,
    async () => ({ username: "student@example.edu", password: "private-password" }),
    new AbortController().signal,
  );
  assert.deepEqual(result, {
    status: "authenticated",
    url: "https://piazza.com/dashboard",
  });
});

test("uses a portal-domain credential after a UofT SSO redirect", async () => {
  const requested: string[] = [];
  const result = await attemptCredentialLogin(
    fakePage({
      url: "https://idpz.utorauth.utoronto.ca/idp/profile/SAML2/Redirect/SSO",
      action: "/idp/profile/SAML2/POST/SSO",
      afterSubmitUrl: "https://q.utoronto.ca/",
    }),
    quercus,
    async (hostname) => {
      requested.push(hostname);
      if (hostname === "q.utoronto.ca") {
        return { username: "studentid", password: "utorid-password" };
      }
      return null;
    },
    new AbortController().signal,
  );
  assert.deepEqual(requested, ["idpz.utorauth.utoronto.ca", "q.utoronto.ca"]);
  assert.deepEqual(result, {
    status: "authenticated",
    url: "https://q.utoronto.ca/",
  });
});

test("can reuse a saved ACORN UTORid at the shared UofT sign-in host", async () => {
  const requested: string[] = [];
  const result = await attemptCredentialLogin(
    fakePage({
      url: "https://idpz.utorauth.utoronto.ca/idp/profile/SAML2/Redirect/SSO",
      action: "/idp/profile/SAML2/POST/SSO",
      afterSubmitUrl: "https://q.utoronto.ca/",
    }),
    quercus,
    async (hostname) => {
      requested.push(hostname);
      return hostname === "www.acorn.utoronto.ca"
        ? { username: "studentid", password: "utorid-password" }
        : null;
    },
    new AbortController().signal,
  );
  assert.deepEqual(requested, [
    "idpz.utorauth.utoronto.ca",
    "q.utoronto.ca",
    "weblogin.utoronto.ca",
    "www.acorn.utoronto.ca",
  ]);
  assert.deepEqual(result, { status: "authenticated", url: "https://q.utoronto.ca/" });
});

test("allows a Quercus form to post to the UofT IdP", async () => {
  const result = await attemptCredentialLogin(
    fakePage({
      url: "https://q.utoronto.ca/login/openid_connect",
      action: "https://idpz.utorauth.utoronto.ca/idp/profile/SAML2/Redirect/SSO",
      afterSubmitUrl: "https://q.utoronto.ca/",
    }),
    quercus,
    async (hostname) => hostname === "q.utoronto.ca"
      ? { username: "studentid", password: "utorid-password" }
      : null,
    new AbortController().signal,
  );
  assert.deepEqual(result, {
    status: "authenticated",
    url: "https://q.utoronto.ca/",
  });
});

test("stops at UTORMFA instead of treating Duo as a collected page", async () => {
  const result = await attemptCredentialLogin(
    fakePage({
      url: "https://idpz.utorauth.utoronto.ca/idp/profile/SAML2/Redirect/SSO",
      afterSubmitUrl: "https://idpz.utorauth.utoronto.ca/idp/profile/SAML2/Redirect/SSO",
      afterSubmitBody: "Approve the request in the Duo Mobile app to finish UTORMFA.",
    }),
    quercus,
    async () => ({ username: "studentid", password: "utorid-password" }),
    new AbortController().signal,
  );
  assert.deepEqual(result, { status: "form_unsupported" });
});
