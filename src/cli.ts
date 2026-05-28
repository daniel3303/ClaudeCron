#!/usr/bin/env node
import { runCommand } from './commands/run.js';

const USAGE = `claude-cron — schedule recurring claude runs

usage: claude-cron <interval> "<prompt>" [idle-seconds]
  interval     : 30s | 10m | 2h | bare seconds (wait between runs)
  prompt       : the prompt to send to claude
  idle-seconds : quiet period that means "done" (default 5)

examples:
  claude-cron 10m "summarize today's market news"
  claude-cron 2h  "check for new SEC filings on AAPL" 15
`;

async function main(): Promise<void> {
  const [interval, prompt, idleSeconds] = process.argv.slice(2);
  if (!interval || !prompt) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  try {
    await runCommand({ interval, prompt, idleSeconds });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}

main();
