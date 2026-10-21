import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { constants as osConstants } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const ACTIVE = 'LIFE_BOARD_XVFB_ACTIVE';
const signalCode = signal => 128 + (osConstants.signals[signal] ?? 1);

export function displayMode(args = [], env = process.env, platform = process.platform) {
  const mode = env.LIFE_BOARD_TEST_DISPLAY;
  if (mode && !['host', 'xvfb'].includes(mode)) throw new Error('LIFE_BOARD_TEST_DISPLAY must be host or xvfb.');
  const interactive = args.some(arg => /^(--debug|--ui)(=|$)/.test(arg)) || Boolean(env.PWDEBUG && env.PWDEBUG !== '0');
  return platform !== 'linux' || mode === 'host' || interactive ? 'host' : 'xvfb';
}

function requireDisplayTools(env) {
  const missing = ['Xvfb', 'xvfb-run', 'xauth'].filter(command => !env.PATH?.split(delimiter).some(directory => {
    try { accessSync(join(directory, command), constants.X_OK); return true; } catch { return false; }
  }));
  if (missing.length) throw new Error(`Missing virtual display tools: ${missing.join(', ')}. Install with: sudo apt-get install xvfb xauth. Use LIFE_BOARD_TEST_DISPLAY=host for visible diagnostics.`);
}

function processExists(child) {
  if (!child?.pid) return false;
  try {
    if (process.platform === 'win32') return child.exitCode === null && child.signalCode === null;
    process.kill(-child.pid, 0);
    return true;
  } catch { return false; }
}

export async function stopProcess(child, graceMs = 2000, signal = 'SIGTERM') {
  if (!processExists(child)) return;
  const send = value => {
    try { if (process.platform === 'win32') child.kill(value); else process.kill(-child.pid, value); } catch {}
  };
  send(signal);
  const deadline = Date.now() + graceMs;
  while (processExists(child) && Date.now() < deadline) await delay(50);
  if (processExists(child)) send('SIGKILL');
}

export async function runCommand(command, args, env = process.env) {
  const child = spawn(command, args, { env, stdio: 'inherit', detached: process.platform !== 'win32' });
  let interrupted;
  let stopping;
  const handler = signal => {
    interrupted ??= signal;
    stopping ??= stopProcess(child, 5000, signal);
  };
  process.on('SIGINT', handler);
  process.on('SIGTERM', handler);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? signalCode(signal)));
    });
    if (stopping) await stopping;
    return interrupted ? signalCode(interrupted) : code;
  } finally {
    process.off('SIGINT', handler);
    process.off('SIGTERM', handler);
    await stopProcess(child);
  }
}

export async function ensureTestDisplay(args = []) {
  if (displayMode(args) === 'host') return;
  if (process.env[ACTIVE] === '1') {
    if (!process.env.DISPLAY) throw new Error('Managed Xvfb display is missing DISPLAY.');
    return;
  }
  requireDisplayTools(process.env);
  const env = { ...process.env, [ACTIVE]: '1', XDG_SESSION_TYPE: 'x11', GDK_BACKEND: 'x11', WAYLAND_DISPLAY: '' };
  delete env.WAYLAND_SOCKET;
  console.error('[test-display] Running in Xvfb (1920x1080x24).');
  const code = await runCommand('xvfb-run', [
    '-a', '-e', '/dev/stderr', '-s', '-screen 0 1920x1080x24 -nolisten tcp',
    process.execPath, ...process.execArgv, ...process.argv.slice(1),
  ], env);
  process.exit(code);
}
