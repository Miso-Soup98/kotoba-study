import { spawn } from 'node:child_process';
import { renameSync, writeFileSync } from 'node:fs';

const [mode, record, expiresText, ...args] = process.argv.slice(2);
const expiresAt = Number(expiresText);
if (!Number.isFinite(expiresAt)) throw new Error('Fixture expiry is required.');

// Independent of the guard: even a broken launcher cannot leave these fixture
// processes running for more than 25 seconds. The child shares our deadline.
const remainingMs = Math.max(1, Math.min(25_000, expiresAt - Date.now()));
setTimeout(() => process.exit(98), remainingMs).unref();

if (mode === 'leaf') {
  console.log('fixture leaf alive');
  setInterval(() => {}, 1_000);
} else {
  const child = spawn(process.execPath, [import.meta.filename, 'leaf', '-', String(expiresAt)], {
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', error => {
    console.error(error.message);
    process.exit(97);
  });
  const data = { parent: process.pid, child: child.pid, args, expiresAt };
  writeFileSync(record + '.partial', JSON.stringify(data));
  renameSync(record + '.partial', record);
  console.log('fixture parent and child alive');
  if (mode === 'parent-exits') {
    // Let the guard record at least one sample containing both processes.
    setTimeout(() => process.exit(0), 1_200);
  } else if (mode === 'output-limit') {
    // About 1.25 MiB/second, with backpressure. No unbounded in-memory queue.
    const block = Buffer.alloc(128 * 1024, 'x');
    let writable = true;
    process.stdout.on('drain', () => { writable = true; });
    setInterval(() => {
      if (writable) writable = process.stdout.write(block);
    }, 100);
  } else {
    setInterval(() => {}, 1_000);
  }
}
