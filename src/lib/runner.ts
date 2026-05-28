import pty from 'node-pty';

const TICK_MS = 500;
const KILL_GRACE_MS = 200;
const SUBMIT_DELAY_MS = 200;
const CTRL_C = '\x03';

export interface RunOnceOptions {
  prompt: string;
  idleSeconds: number;
  settleSeconds: number;
  onOutput?: (data: string) => void;
  onSpawn?: (child: pty.IPty) => void;
  signal?: AbortSignal;
}

export function runOnce(options: RunOnceOptions): Promise<void> {
  const { prompt, idleSeconds, settleSeconds, onOutput, onSpawn, signal } = options;
  return new Promise(resolve => {
    const child = pty.spawn('claude', [], {
      name: process.env.TERM ?? 'xterm-256color',
      cols: process.stdout.columns ?? 120,
      rows: process.stdout.rows ?? 30,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });
    onSpawn?.(child);

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
          // Type the prompt, then send TWO Enters. A slash-command prompt
          // opens an autocomplete dropdown in Claude's TUI, and the first
          // Enter only confirms the highlighted completion instead of
          // submitting. The second Enter submits. For non-slash prompts the
          // first Enter submits and the second lands on an empty input box,
          // which the TUI ignores.
          child.write(prompt);
          lastOutputMs = Date.now();
          sendEnter(child, SUBMIT_DELAY_MS, () => { lastOutputMs = Date.now(); });
          sendEnter(child, SUBMIT_DELAY_MS * 2, () => { lastOutputMs = Date.now(); });
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

function sendEnter(child: pty.IPty, delayMs: number, onSent: () => void): void {
  setTimeout(() => {
    try {
      child.write('\r');
      onSent();
    } catch {
      // child already exited; ignore
    }
  }, delayMs);
}

function safeKill(child: pty.IPty): void {
  try {
    child.kill();
  } catch {
    // already exited; ignore
  }
}
