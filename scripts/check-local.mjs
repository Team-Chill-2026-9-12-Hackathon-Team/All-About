const backendUrl = process.env.ALLABOUT_BACKEND_URL ?? "http://127.0.0.1:3001";
const webUrl = process.env.ALLABOUT_WEB_URL ?? "http://127.0.0.1:5174";
const wait = process.argv.includes("--wait");
const deadline = Date.now() + (wait ? 30_000 : 0);

async function readHealth(baseUrl) {
  const response = await fetch(new URL("/api/health", baseUrl), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(2_000),
  });
  const body = await response.text();
  return { url: new URL("/api/health", baseUrl).href, status: response.status, body };
}

async function inspect() {
  const [backend, frontendProxy] = await Promise.all([
    readHealth(backendUrl),
    readHealth(webUrl),
  ]);
  const ok = [backend, frontendProxy].every(
    (item) => item.status === 200 && item.body === '{"ok":true}',
  );
  return { ok, backend, frontendProxy };
}

let lastError;
while (true) {
  try {
    const result = await inspect();
    if (result.ok) {
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    lastError = new Error("A health endpoint returned an unexpected response.");
  } catch (error) {
    lastError = error;
  }
  if (Date.now() >= deadline) {
    console.error(JSON.stringify({
      ok: false,
      backendUrl,
      webUrl,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }, null, 2));
    process.exitCode = 1;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
