import pty from 'node-pty';

const TICK_MS = 500;
const KILL_GRACE_MS = 200;
const CTRL_C = '\x03';

export interface RunOnceOptions {
  prompt: string;
  idleSeconds: number;
  settleSeconds: number;
  onOutput?: (data: string) => void;
  signal?: AbortSignal;
}

export function runOnce(options: RunOnceOptions): Promise<void> {
  const { prompt, idleSeconds, settleSeconds, onOutput, signal } = options;
  return new Promise(resolve => {
    const child = pty.spawn('claude', [], {
      name: process.env.TERM ?? 'xterm-256color',
      cols: process.stdout.columns ?? 120,
      rows: process.stdout.rows ?? 30,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    let lastOutputMs = Date.now();
    let promptSent = false;

    child.onData(data => {
      onOutput?.(data);
      lastOutputMs = Date.now();
    });

    const tick = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(tick);
        safeKill(child);
        return;
      }
      const quietMs = Date.now() - lastOutputMs;
      if (!promptSent) {
        if (quietMs >= settleSeconds * 1000) {
          promptSent = true;
          child.write(prompt + '\r');
          lastOutputMs = Date.now();
        }
        return;
      }
      if (quietMs >= idleSeconds * 1000) {
        clearInterval(tick);
        try {
          child.write(CTRL_C);
        } catch {
          // child already exited; ignore
        }
        setTimeout(() => safeKill(child), KILL_GRACE_MS);
      }
    }, TICK_MS);

    child.onExit(() => {
      clearInterval(tick);
      resolve();
    });
  });
}

function safeKill(child: pty.IPty): void {
  try {
    child.kill();
  } catch {
    // already exited; ignore
  }
}
