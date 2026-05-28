import { parseInterval } from '../lib/interval.js';
import { runOnce } from '../lib/runner.js';

const DEFAULT_IDLE_SECONDS = 5;
const SETTLE_SECONDS = 2;

export interface RunCommandArgs {
  interval: string;
  prompt: string;
  idleSeconds?: string;
}

export async function runCommand(args: RunCommandArgs): Promise<void> {
  const intervalSeconds = parseInterval(args.interval);
  const idleSeconds = parseIdleSeconds(args.idleSeconds);

  const controller = new AbortController();
  process.on('SIGINT', () => {
    process.stdout.write('\n[claude-cron] stopping…\n');
    controller.abort();
  });

  while (!controller.signal.aborted) {
    process.stdout.write('\n[claude-cron] launching claude…\n');
    await runOnce({
      prompt: args.prompt,
      idleSeconds,
      settleSeconds: SETTLE_SECONDS,
      onOutput: data => process.stdout.write(data),
      signal: controller.signal,
    });
    if (controller.signal.aborted) break;
    process.stdout.write(`\n[claude-cron] done. sleeping ${intervalSeconds}s…\n`);
    try {
      await sleep(intervalSeconds * 1000, controller.signal);
    } catch {
      break;
    }
  }
  process.stdout.write('\n[claude-cron] stopped\n');
}

function parseIdleSeconds(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_IDLE_SECONDS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid idle-seconds: "${raw}"`);
  }
  return value;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true }
    );
  });
}
