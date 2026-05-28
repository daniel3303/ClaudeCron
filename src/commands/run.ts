import type { IPty } from 'node-pty';
import { parseInterval } from '../lib/interval.js';
import { runOnce } from '../lib/runner.js';

const DEFAULT_IDLE_SECONDS = 5;
const SETTLE_SECONDS = 2;
const CTRL_C_BYTE = 0x03;

export interface RunCommandArgs {
  interval: string;
  prompt: string;
  idleSeconds?: string;
}

export async function runCommand(args: RunCommandArgs): Promise<void> {
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

function setupStdinForwarding(
  getChild: () => IPty | null,
  onInterrupt: () => void
): () => void {
  if (!process.stdin.isTTY) return () => { /* nothing to restore */ };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  const onData = (data: Buffer): void => {
    if (data.length === 1 && data[0] === CTRL_C_BYTE) {
      onInterrupt();
      return;
    }
    getChild()?.write(data.toString());
  };
  process.stdin.on('data', onData);

  return () => {
    process.stdin.off('data', onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
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
