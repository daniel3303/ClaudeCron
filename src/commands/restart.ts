import type { IPty } from 'node-pty';
import { parseInterval } from '../lib/interval.js';
import { runOnce } from '../lib/runner.js';
import { sleep } from '../lib/sleep.js';
import { setupStdinForwarding } from '../lib/stdin.js';

const DEFAULT_IDLE_SECONDS = 5;
const SETTLE_SECONDS = 2;

export interface RestartCommandArgs {
  interval: string;
  prompt: string;
  idleSeconds?: string;
}

/**
 * Restart mode: every `interval`, spawn a fresh Claude, send the prompt,
 * wait for it to go idle, kill it, sleep, repeat. This is the original
 * `claude-cron` behaviour — best when each run is a discrete one-shot
 * task and conversation context should NOT carry across runs.
 *
 * Compare with `clearCommand` (clear mode), which keeps a single Claude
 * alive and only resets its context periodically.
 */
export async function restartCommand(args: RestartCommandArgs): Promise<void> {
  const intervalSeconds = parseInterval(args.interval);
  const idleSeconds = parseIdleSeconds(args.idleSeconds);

  const controller = new AbortController();
  let currentChild: IPty | null = null;

  const restoreStdin = setupStdinForwarding(
    () => currentChild,
    () => controller.abort()
  );
  const sigintHandler = (): void => controller.abort();
  process.on('SIGINT', sigintHandler);

  try {
    while (!controller.signal.aborted) {
      process.stdout.write('\n[claude-cron] launching claude…\n');
      await runOnce({
        prompt: args.prompt,
        idleSeconds,
        settleSeconds: SETTLE_SECONDS,
        onOutput: data => process.stdout.write(data),
        onSpawn: child => { currentChild = child; },
        signal: controller.signal,
      });
      currentChild = null;
      if (controller.signal.aborted) break;
      process.stdout.write(`\n[claude-cron] done. sleeping ${intervalSeconds}s…\n`);
      try {
        await sleep(intervalSeconds * 1000, controller.signal);
      } catch {
        break;
      }
    }
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    restoreStdin();
    process.stdout.write('\n[claude-cron] stopped\n');
  }
}

function parseIdleSeconds(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_IDLE_SECONDS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid idle-seconds: "${raw}"`);
  }
  return value;
}
