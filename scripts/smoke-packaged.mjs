// Launch the packaged app (out/Shortty-<platform>-<arch>) in hermetic e2e mode
// and wait for "App ready" in its log. Catches what tests running against the
// repo's node_modules cannot: a packaged app that crashes on start.
// Usage: node scripts/smoke-packaged.mjs   (after `make package`)
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = 60_000; // a start-up crash shows a modal dialog, so it surfaces as this timeout
const out = path.resolve('out');
const dir = readdirSync(out).find((d) => d.startsWith(`Shortty-${process.platform}-`));
if (!dir) throw new Error(`no packaged app for ${process.platform} in out/: run make package`);
const exe = {
  darwin: path.join(out, dir, 'Shortty.app/Contents/MacOS/shortty'),
  win32: path.join(out, dir, 'shortty.exe'),
  linux: path.join(out, dir, 'shortty'),
}[process.platform];

const data = mkdtempSync(path.join(tmpdir(), 'shortty-smoke-'));
const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
const child = spawn(exe, args, {
  env: { ...process.env, SHORTTY_E2E: '1', SHORTTY_E2E_DIR: data },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

// The console transport mirrors the log; read it from the app's output.
const finish = (ok, reason) => {
  child.kill();
  if (!ok) console.error(output);
  console[ok ? 'log' : 'error'](`smoke: ${reason}`);
  rmSync(data, { recursive: true, force: true, maxRetries: 5 });
  process.exit(ok ? 0 : 1);
};

child.on('exit', (code) => finish(false, `app exited early with code ${code}`));
const started = Date.now();
const timer = setInterval(() => {
  if (/Uncaught|Cannot find module/.test(output)) finish(false, 'app crashed on start');
  else if (output.includes('App ready')) finish(true, `App ready after ${Date.now() - started} ms`);
  else if (Date.now() - started > TIMEOUT_MS) finish(false, 'no "App ready" within 60 s');
}, 500);
timer.unref?.();
