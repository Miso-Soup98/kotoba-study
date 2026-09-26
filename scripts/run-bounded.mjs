import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// Call before importing Vite/Vinext/Wrangler. Returns false only when this
// process should continue normally (non-Windows or already inside its job).
export async function runBounded({ executable=process.execPath, args=process.argv.slice(1), cwd=process.cwd(), mode='dev', limits={} }={}) {
  if(process.platform!=='win32' || process.env.KOTOBA_BOUNDED_RUN==='1') return false;
  const guard=fileURLToPath(new URL('./bounded-run.ps1',import.meta.url));
  const powershell=process.env.KOTOBA_POWERSHELL_EXE || path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  if(!path.isAbsolute(powershell) || !existsSync(powershell)) throw Error('64-bit PowerShell is required for guarded local runs.');
  const config={
    Executable:executable,WorkingDirectory:cwd,ArgumentList:args,
    LogDirectory:path.join(process.env.LOCALAPPDATA || os.tmpdir(),'KotobaStudy','Diagnostics','guarded-runs'),
    MaxPrivateMiB:4096,MinAvailableMiB:2048,MaxCommitPercent:85,
    SampleSeconds:5,TimeoutSeconds:mode==='build'?1800:14400,MaxOutputMiB:64,
    ...limits,ParentProcessId:process.pid,
  };
  const child=spawn(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',guard,'-ConfigFromStdin'],{
    cwd,env:{...process.env,KOTOBA_BOUNDED_RUN:'1'},windowsHide:true,stdio:['pipe','inherit','inherit'],
  });
  // Pipe structured UTF-8 JSON: no PowerShell command-string interpolation and
  // no reliance on -File's lossy array binding. No credential/argv is logged.
  child.stdin.on('error',error=>{if(error.code!=='EPIPE') console.error(error.message);});
  child.stdin.end(JSON.stringify(config));
  const forward=()=>{if(!child.killed) child.kill();};
  process.once('SIGINT',forward); process.once('SIGTERM',forward);
  try {
    const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve(code ?? (signal?130:125)));});
    process.exitCode=exitCode;
  } finally {
    process.off('SIGINT',forward);process.off('SIGTERM',forward);
  }
  return true;
}
