#!/usr/bin/env node
import { clearCommand } from './commands/clear.js';
import { compactCommand } from './commands/compact.js';
import { restartCommand } from './commands/restart.js';

const USAGE = `claude-cron — schedule recurring claude runs

usage:
  claude-cron restart <interval> "<prompt>" [idle-seconds]
  claude-cron clear   <interval> "<prompt>"
  claude-cron compact <interval> "<prompt>"

modes:
  restart  spawn a fresh claude every <interval>, send the prompt,
           wait for it to go idle, kill, sleep, repeat. No context
           survives between runs.

  clear    spawn ONE claude session, send the prompt once, then every
           <interval> send /clear and re-send the prompt. Best when
           the prompt is itself long-running (e.g. /loop) and you only
           want to drop accumulated context — not the loop itself.

  compact  same shape as clear, but sends /compact instead of /clear so
           Claude summarises the conversation history into a shorter
           form rather than wiping it. Use when you DO want runs to
           remember each other but don't want context to balloon.

args:
  interval     30s | 10m | 2h | bare seconds
  prompt       the prompt to send to claude
  idle-seconds restart-mode only — quiet period that means "done"
               (default 5)

examples:
  claude-cron restart 10m "summarize today's market news"
  claude-cron clear   30m "/loop 1m /improve-code"
  claude-cron compact 1h  "/loop 5m /add-test"
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const [first] = argv;
  try {
    if (first === 'restart') {
      const [, interval, prompt, idleSeconds] = argv;
      requireArgs({ interval, prompt }, 'restart');
      await restartCommand({ interval, prompt, idleSeconds });
      return;
    }
    if (first === 'clear') {
      const [, interval, prompt] = argv;
      requireArgs({ interval, prompt }, 'clear');
      await clearCommand({ interval, prompt });
      return;
    }
    if (first === 'compact') {
      const [, interval, prompt] = argv;
      requireArgs({ interval, prompt }, 'compact');
      await compactCommand({ interval, prompt });
      return;
    }
    process.stderr.write(`unknown subcommand: "${first}"\n\n${USAGE}`);
    process.exit(2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}

function requireArgs(
  args: { interval?: string; prompt?: string },
  mode: string
): asserts args is { interval: string; prompt: string } {
  if (!args.interval || !args.prompt) {
    throw new Error(`${mode}: <interval> and <prompt> are required`);
  }
}

main();
