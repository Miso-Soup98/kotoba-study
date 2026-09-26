import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const windows64 = process.platform === 'win32' && process.arch !== 'ia32';
const expectedArgs = ['space argument', '中文 日本語', 'quote"test', 'trailing\\', ''];

function processExists(pid) {
  try {
    process.kill(pid, 0); // Read-only existence check; never terminate by PID.
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function readJsonIfPresent(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function until(check, milliseconds, description) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(75);
  }
  throw new Error(description);
}

async function deadline(promise, milliseconds, description) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(description)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function launch(mode, directory, record) {
  const wrapper = spawn(process.execPath, [
    path.join(import.meta.dirname, 'guard-driver.mjs'), mode, record, directory,
  ], {
    cwd: directory,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, KOTOBA_BOUNDED_RUN: '' },
  });
  let output = '';
  const keepTail = chunk => { output = (output + chunk.toString()).slice(-20_000); };
  wrapper.stdout.on('data', keepTail);
  wrapper.stderr.on('data', keepTail);
  const state = { closed: false, spawnError: undefined };
  const finished = new Promise(resolve => {
    wrapper.once('error', error => { state.spawnError = error; });
    wrapper.once('close', (code, signal) => {
      state.closed = true;
      resolve({ code, signal, spawnError: state.spawnError });
    });
  });
  return { wrapper, finished, state, output: () => output };
}

function requestGuardStop(run) {
  if (run.wrapper.connected) {
    try { run.wrapper.send({ action: 'stop-owned-guard' }, () => {}); } catch { }
  }
}

async function cleanOwnedWrapper(run) {
  // This finally path runs after every assertion or timeout. First give the
  // driver a chance to close its exact guard handle, then terminate only the
  // exact ChildProcess instance created by this test. No process-name lookup.
  if (run.state.closed) return;
  requestGuardStop(run);
  try {
    await deadline(run.finished, 1_500, 'driver cleanup grace period');
  } catch {
    if (run.wrapper.exitCode === null && run.wrapper.signalCode === null) {
      run.wrapper.kill();
    }
    try { await deadline(run.finished, 3_000, 'wrapper cleanup timeout'); } catch { }
  } finally {
    if (run.wrapper.exitCode === null && run.wrapper.signalCode === null) {
      run.wrapper.kill();
    }
    // Do not retain pipes if a deliberately broken guard held their writer.
    run.wrapper.stdout.destroy();
    run.wrapper.stderr.destroy();
    if (run.wrapper.connected) {
      try { run.wrapper.disconnect(); } catch { }
    }
  }
}

async function checkScenario(context, mode) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kotoba-guard-' + mode + '-'));
  context.diagnostic('Temporary guard artifacts: ' + directory);
  const record = path.join(directory, 'fixture-pids.json');
  const run = launch(mode, directory, record);
  let fixture;
  try {
    if (mode !== 'preflight') {
      fixture = await until(async () => {
        const value = await readJsonIfPresent(record);
        if (!value && run.state.closed) throw new Error('Fixture did not start:\n' + run.output());
        return value;
      }, 10_000, 'Fixture startup exceeded 10 seconds.\n' + run.output());
      assert.deepEqual(fixture.args, expectedArgs, 'UTF-8 and Windows argument boundaries must survive');
      assert(Number.isSafeInteger(fixture.parent) && Number.isSafeInteger(fixture.child));
    }

    if (mode === 'wrapper-killed') run.wrapper.kill();
    if (mode === 'guard-killed') requestGuardStop(run);
    const status = await deadline(run.finished, 18_000, 'Guard did not exit.\n' + run.output());
    if (status.spawnError) throw status.spawnError;
    if (fixture) {
      await until(() => !processExists(fixture.parent) && !processExists(fixture.child), 5_000,
        'Owned fixture parent or child survived guard shutdown');
    }

    const names = await readdir(directory);
    const diagnostics = names.filter(name => name.endsWith('.jsonl'));
    assert.equal(diagnostics.length, 1, 'Expected one run diagnostic file');
    const events = (await readFile(path.join(directory, diagnostics[0]), 'utf8'))
      .trim().split(/\r?\n/).map(line => JSON.parse(line));
    const stop = events.find(event => event.kind === 'stopping' || event.kind === 'refused');
    const started = events.find(event => event.kind === 'started');
    if (mode !== 'preflight') {
      assert.equal(started?.data.pid, fixture.parent);
      assert.equal(started?.data.jobMemoryLimitBytes, 256 * 1024 * 1024);
      assert.equal(started?.data.parentPid, run.wrapper.pid);
      assert.match(started?.data.createdUtc ?? '', /^\d{4}-\d{2}-\d{2}T/);
    }
    if (mode === 'parent-exits') {
      assert.equal(status.code, 0, run.output());
      assert.equal(stop?.data.reason, 'root-exited');
    } else if (mode === 'timeout') {
      assert.equal(status.code, 124, run.output());
      assert.equal(stop?.data.reason, 'timeout');
    } else if (mode === 'preflight') {
      assert.equal(status.code, 125, run.output());
      assert.equal(stop?.data.reason, 'system-pressure-before-start');
      assert.equal(await readJsonIfPresent(record), null, 'Refusal must happen before starting the fixture');
      assert.equal(started, undefined);
    } else if (mode === 'wrapper-killed') {
      // Forced closure may prevent any final log write. Kernel Job cleanup is
      // asserted independently by checking both fixture processes above.
      if (stop) assert.equal(stop.data.reason, 'launcher-parent-exited');
    } else if (mode === 'output-limit') {
      assert.equal(status.code, 124, run.output());
      assert.equal(stop?.data.reason, 'output-log-limit');
      const outputName = names.find(name => name.endsWith('-output.log'));
      assert(outputName);
      const bytes = (await stat(path.join(directory, outputName))).size;
      assert(bytes <= 1024 * 1024, 'Retained process output must not exceed its configured ceiling');
    }
    const peak = Math.max(0, ...events.filter(event => event.kind === 'sample')
      .map(event => event.data.privateBytes));
    assert(peak < 128 * 1024 * 1024, 'These fixtures must remain lightweight, not a memory stress test');
  } finally {
    await cleanOwnedWrapper(run);
  }
}

const cases = [
  ['normal root exit also removes its child', 'parent-exits'],
  ['deadline stops only the owned process tree', 'timeout'],
  ['force-closing the wrapper removes its guarded tree', 'wrapper-killed'],
  ['force-closing the guard triggers kernel Job cleanup', 'guard-killed'],
  ['system-pressure preflight refuses before creating children', 'preflight'],
  ['process-output limit stops its tree and caps the retained file', 'output-limit'],
];
for (const [name, mode] of cases) {
  test(name, { skip: !windows64, concurrency: false, timeout: 45_000 }, context => checkScenario(context, mode));
}
