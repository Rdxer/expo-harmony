import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/** Stop a Windows command and its descendants before callers restore build inputs. */
export async function terminateProcess(child: ChildProcess, signal: NodeJS.Signals): Promise<void> {
  if (!child.pid) return;

  if (process.platform !== 'win32') {
    child.kill(signal);
    return;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const command = path.win32.join(process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe');
      const killer = spawn(command, ['/pid', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });

      const timer = setTimeout(() => {
        try {
          killer.kill('SIGKILL');
        } catch { /* Still report the bounded termination failure. */ }
        killer.unref();
        reject(new Error(`Timed out terminating process tree ${child.pid}.`));
      }, 5_000);

      killer.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      killer.once('exit', (code) => {
        clearTimeout(timer);

        if (code === 0) resolve();
        else reject(new Error(`taskkill failed for process tree ${child.pid} (exit ${code}).`));
      });
    });
  } catch (cause) {
    // A failed taskkill must be reported, but must not keep the caller hung forever.
    child.unref();

    throw new Error(`Unable to terminate process tree ${child.pid}.`, { cause });
  } finally {
    // Descendants can retain pipe handles after the immediate child has exited.
    // taskkill has finished (or failed explicitly); do not wait forever for EOF.
    child.stdin?.destroy();
    child.stdout?.destroy();
    child.stderr?.destroy();
  }
}
