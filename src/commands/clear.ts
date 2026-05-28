import { runResetLoop } from '../lib/reset-loop.js';

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
 * Compare with `restartCommand` (kills and respawns Claude each cycle)
 * and `compactCommand` (summarises the context instead of wiping it).
 */
export async function clearCommand(args: ClearCommandArgs): Promise<void> {
  await runResetLoop({
    interval: args.interval,
    prompt: args.prompt,
    resetCommand: '/clear',
    modeLabel: 'clear',
    onOutput: data => process.stdout.write(data),
    onStatus: line => process.stdout.write(`\n[claude-cron] ${line}\n`),
  });
}
