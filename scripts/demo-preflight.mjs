import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const checks = [];

for (const url of ['http://127.0.0.1:3001/api/health', 'http://127.0.0.1:5174/api/health']) {
  try {
    const response = await fetch(url);
    checks.push({ name: url, passed: response.ok && (await response.json()).ok === true });
  } catch (error) {
    checks.push({ name: url, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

for (const file of [
  'outputs/live-web-acceptance.json',
  'outputs/live-fixture-acceptance-run-1.json',
  'outputs/live-fixture-acceptance-run-2.json',
  'outputs/live-fixture-acceptance-run-3.json',
]) {
  try {
    const value = JSON.parse(await readFile(new URL(file, root), 'utf8'));
    checks.push({ name: file, passed: value.passed === true });
  } catch (error) {
    checks.push({ name: file, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

console.log(JSON.stringify({ passed: checks.every((check) => check.passed), checks }, null, 2));
if (checks.some((check) => !check.passed)) process.exitCode = 1;
