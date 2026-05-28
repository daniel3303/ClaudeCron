import pty from 'node-pty';
import { parseInterval } from '../lib/interval.js';
import { sleep } from '../lib/sleep.js';
import { setupStdinForwarding } from '../lib/stdin.js';

const SETTLE_SECONDS = 2;
const SETTLE_POLL_MS = 250;
const CTRL_C = '\x03';
const CLEAR_COMMAND = '/clear';

export interface ClearCommandArgs {
  interval: string;
  prompt: string;
}

/**
 * Clear mode: spawn a SINGLE Claude session, send the prompt once, and
 * every `interval` send `/clear` to wipe the conversation context and
 * re-send the prompt. Best when the prompt is itself a long-running
 * loop (e.g. `/loop 1m /improve-code`) whose context would otherwise
 * grow unbounded across hours of runtime.
 *
 * Compare with `restartCommand` (restart mode), which kills and respawns
 * Claude each cycle and never preserves anything.
 */
export async function clearCommand(args: ClearCommandArgs): Promise<void> {
  const intervalSeconds = parseInterval(args.interval);
  const controller = new AbortController();

  const child = pty.spawn('claude', [], {
    name: process.env.TERM ?? 'xterm-256color',
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 30,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });

  let lastOutputMs = Date.now();
  child.onData(data => {
    process.stdout.write(data);
    lastOutputMs = Date.now();
  });
  child.onExit(() => controller.abort());

  const restoreStdin = setupStdinForwarding(() => child, () => controller.abort());
  const sigintHandler = (): void => {
    controller.abort();
    safeKill(child);
  };
  process.on('SIGINT', sigintHandler);

  try {
    process.stdout.write('\n[claude-cron] launching claude (single session, clear mode)…\n');
    await waitForSettle(() => lastOutputMs, controller.signal);
    if (controller.signal.aborted) return;

    sendPrompt(child, args.prompt);

    while (!controller.signal.aborted) {
      try {
        await sleep(intervalSeconds * 1000, controller.signal);
      } catch {
        break;
      }
      if (controller.signal.aborted) break;

      process.stdout.write(`\n[claude-cron] sending ${CLEAR_COMMAND}\n`);
      child.write(CLEAR_COMMAND + '\r');
      try {
        await waitForSettle(() => lastOutputMs, controller.signal);
      } catch {
        break;
      }
      if (controller.signal.aborted) break;

      sendPrompt(child, args.prompt);
    }
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    restoreStdin();
    safeKill(child);
    process.stdout.write('\n[claude-cron] stopped\n');
  }
}

function sendPrompt(child: pty.IPty, prompt: string): void {
  process.stdout.write('\n[claude-cron] sending prompt\n');
  child.write(prompt + '\r');
}

/**
 * Wait until the child stops emitting output for `SETTLE_SECONDS` —
 * heuristic for "Claude is back at the input box and ready for the next
 * keystroke". Same shape as `runner.ts` uses to detect the initial-prompt
 * point.
 */
async function waitForSettle(
  getLastOutputMs: () => number,
  signal: AbortSignal
): Promise<void> {
  while (!signal.aborted) {
    const quietMs = Date.now() - getLastOutputMs();
    if (quietMs >= SETTLE_SECONDS * 1000) return;
    try {
      await sleep(SETTLE_POLL_MS, signal);
    } catch {
      return;
    }
  }
}

function safeKill(child: pty.IPty): void {
  try {
    child.write(CTRL_C);
  } catch {
    // child may already be gone
  }
  try {
    child.kill();
  } catch {
    // already dead
  }
}
