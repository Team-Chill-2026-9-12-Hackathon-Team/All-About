import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverPort = 31991;
const webPort = 51991;
const serverUrl = `http://127.0.0.1:${serverPort}/api/health`;
const webUrl = `http://127.0.0.1:${webPort}`;
const children = [];

function start(command, args, env) {
  const child = spawn(command, args, { cwd: root, env: {...process.env, ...env}, stdio: 'pipe' });
  children.push(child);
  return child;
}

async function waitFor(url, label) {
  let detail = 'timed out';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return {name: label, passed: true};
      detail = `HTTP ${response.status}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {name: label, passed: false, detail};
}

try {
  start('npm', ['run', 'start', '--workspace', '@allabout/server'], {PORT: String(serverPort)});
  const server = await waitFor(serverUrl, 'isolated backend health');
  if (!server.passed) throw new Error(server.detail);

  start('npm', ['run', 'dev', '--workspace', 'allabout-web', '--', '--host', '127.0.0.1'], {
    ALLABOUT_WEB_PORT: String(webPort),
    ALLABOUT_BACKEND_URL: `http://127.0.0.1:${serverPort}`,
  });
  const web = await waitFor(webUrl, 'isolated frontend health');
  console.log(JSON.stringify({passed: web.passed, checks: [server, web]}, null, 2));
  if (!web.passed) process.exitCode = 1;
} finally {
  for (const child of children) child.kill('SIGTERM');
}
