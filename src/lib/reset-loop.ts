import pty from 'node-pty';
import { parseInterval } from './interval.js';
import { sleep } from './sleep.js';
import { setupStdinForwarding } from './stdin.js';

const SETTLE_SECONDS = 2;
const SETTLE_POLL_MS = 250;
const SUBMIT_DELAY_MS = 200;
const CTRL_C = '\x03';

export interface ResetLoopOptions {
  interval: string;
  prompt: string;
  /** Slash command sent every interval to reset/shrink the context (e.g. `/clear`, `/compact`). */
  resetCommand: string;
  /** Short label used in status lines (e.g. `clear`, `compact`). */
  modeLabel: string;
  /** Forward PTY output. `commands/` wires this to `process.stdout.write`. */
  onOutput?: (data: string) => void;
  /** Bracketed status lines (`launching…`, `sending /compact`, …). Caller chooses how to print. */
  onStatus?: (line: string) => void;
}

/**
 * Single-session loop: spawn one Claude, send the prompt once, then every
 * `interval` send `resetCommand` and re-send the prompt. Generalises both
 * `clear` (`/clear`) and `compact` (`/compact`) modes — they differ only
 * in which slash command they fire on the tick and what they call themselves.
 */
export async function runResetLoop(options: ResetLoopOptions): Promise<void> {
  const { onOutput, onStatus = () => {}, modeLabel, resetCommand } = options;
  const intervalSeconds = parseInterval(options.interval);
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
    onOutput?.(data);
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
    onStatus(`launching claude (single session, ${modeLabel} mode)…`);
    await waitForSettle(() => lastOutputMs, controller.signal);
    if (controller.signal.aborted) return;

    onStatus('sending prompt');
    if (!(await sendAndSubmit(child, options.prompt, controller.signal))) return;

    while (!controller.signal.aborted) {
      try {
        await sleep(intervalSeconds * 1000, controller.signal);
      } catch {
        break;
      }
      if (controller.signal.aborted) break;

      onStatus(`sending ${resetCommand}`);
      if (!(await sendAndSubmit(child, resetCommand, controller.signal))) break;
      try {
        await waitForSettle(() => lastOutputMs, controller.signal);
      } catch {
        break;
      }
      if (controller.signal.aborted) break;

      onStatus('sending prompt');
      if (!(await sendAndSubmit(child, options.prompt, controller.signal))) break;
    }
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    restoreStdin();
    safeKill(child);
    onStatus('stopped');
  }
}

/**
 * Type the text, briefly let the TUI render (so slash-command autocomplete
 * pops up and dismisses), then send Enter. Writing `text + '\r'` as one
 * chunk races with Ink's async render and the Enter sometimes gets eaten by
 * the autocomplete popup, leaving the prompt sitting in the input box.
 * Returns `false` if aborted mid-way so the caller can stop the loop.
 */
async function sendAndSubmit(
  child: pty.IPty,
  text: string,
  signal: AbortSignal
): Promise<boolean> {
  child.write(text);
  try {
    await sleep(SUBMIT_DELAY_MS, signal);
  } catch {
    return false;
  }
  if (signal.aborted) return false;
  child.write('\r');
  return true;
}

/**
 * Wait until the child stops emitting output for `SETTLE_SECONDS` —
 * heuristic for "Claude is back at the input box and ready for the next
 * keystroke". Same shape `runner.ts` uses for its initial-prompt point.
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
