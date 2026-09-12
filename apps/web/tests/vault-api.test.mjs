import assert from "node:assert/strict";
import test from "node:test";

import { createCredential, listCredentials, updateCredential } from "../src/vault-api.ts";

const metadata = {
  id: "credential-1",
  domain: "piazza.com",
  username: "student@example.edu",
  createdAt: "2026-09-12T16:00:00.000Z",
  updatedAt: "2026-09-12T16:00:00.000Z",
};

test("lists credential metadata without expecting a password", async () => {
  const fetcher = async () => new Response(JSON.stringify({ credentials: [metadata] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  assert.deepEqual(await listCredentials(fetcher), [metadata]);
});

test("sends a password on create but omits a blank password on update", async () => {
  const bodies = [];
  const fetcher = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ credential: metadata }), {
      status: init.method === "POST" ? 201 : 200,
      headers: { "content-type": "application/json" },
    });
  };
  await createCredential({
    domain: "piazza.com",
    username: "student@example.edu",
    password: "new-secret",
  }, fetcher);
  await updateCredential("credential-1", {
    domain: "piazza.com",
    username: "updated@example.edu",
    password: "",
  }, fetcher);

  assert.deepEqual(bodies[0], {
    domain: "piazza.com",
    username: "student@example.edu",
    password: "new-secret",
  });
  assert.deepEqual(bodies[1], {
    domain: "piazza.com",
    username: "updated@example.edu",
  });
});
