import { runResetLoop } from '../lib/reset-loop.js';

export interface CompactCommandArgs {
  interval: string;
  prompt: string;
}

/**
 * Compact mode: spawn a SINGLE Claude session, send the prompt once, and
 * every `interval` send `/compact` to summarise the conversation history
 * into a shorter form (preserving continuity) and re-send the prompt.
 *
 * Sits between `restart` (forget everything each cycle) and `clear`
 * (keep the session but wipe its context periodically): use `compact`
 * when you DO want runs to remember each other but don't want context
 * to grow without bound.
 */
export async function compactCommand(args: CompactCommandArgs): Promise<void> {
  await runResetLoop({
    interval: args.interval,
    prompt: args.prompt,
    resetCommand: '/compact',
    modeLabel: 'compact',
    onOutput: data => process.stdout.write(data),
    onStatus: line => process.stdout.write(`\n[claude-cron] ${line}\n`),
  });
}
