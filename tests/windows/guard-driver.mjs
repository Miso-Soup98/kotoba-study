import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { runBounded } from '../../scripts/run-bounded.mjs';

const [mode, record, logDirectory] = process.argv.slice(2);
const nativeSpawn = childProcess.spawn;
let ownedGuard;

// Observe the real ChildProcess object in this isolated test driver. All calls
// still execute native spawn; no guard behavior, Win32 API, or memory is mocked.
// Holding the exact child handle avoids process-name/PID searches when the test
// deliberately terminates the guard.
childProcess.spawn = function (...args) {
  const child = nativeSpawn.apply(this, args);
  if (!ownedGuard) ownedGuard = child;
  return child;
};
syncBuiltinESMExports();

function stopOwnedGuard() {
  if (ownedGuard && ownedGuard.exitCode === null && ownedGuard.signalCode === null) {
    ownedGuard.kill();
  }
}
function onMessage(message) {
  if (message?.action === 'stop-owned-guard') stopOwnedGuard();
}
process.on('message', onMessage);
process.once('disconnect', stopOwnedGuard);

// This deadline is independent of the implementation under test. It bounds the
// driver and terminates only the exact PowerShell child it created.
const emergency = setTimeout(() => {
  stopOwnedGuard();
  process.exit(99);
}, 28_000);
emergency.unref();

const limits = {
  MaxPrivateMiB: 256,
  SampleSeconds: 1,
  TimeoutSeconds: mode === 'timeout' ? 3 : mode === 'parent-exits' ? 8 : 15,
  LogDirectory: logDirectory,
};
if (mode === 'preflight') limits.MinAvailableMiB = 1_048_576;
if (mode === 'output-limit') limits.MaxOutputMiB = 1;

try {
  await runBounded({
    executable: process.execPath,
    cwd: logDirectory,
    args: [
      path.join(import.meta.dirname, 'guard-fixture.mjs'),
      mode,
      record,
      String(Date.now() + 25_000),
      'space argument',
      '中文 日本語',
      'quote"test',
      'trailing\\',
      '',
    ],
    limits,
  });
} finally {
  stopOwnedGuard();
  clearTimeout(emergency);
  process.off('message', onMessage);
  process.off('disconnect', stopOwnedGuard);
  childProcess.spawn = nativeSpawn;
  syncBuiltinESMExports();
  if (process.connected) process.disconnect();
}
