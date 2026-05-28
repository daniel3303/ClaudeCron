# ClaudeCron

Run [Claude Code](https://www.anthropic.com/claude-code) on a schedule.

`claude-cron` launches Claude, sends a prompt, waits for the response to finish, kills the process, then sleeps until the next run.

## Install

```bash
npm install -g claude-cron
```

Requires Node 20+ and `claude` on your `PATH`.

## Usage

```bash
claude-cron <interval> "<prompt>" [idle-seconds]
```

| Arg | Meaning |
| --- | --- |
| `interval` | Time to wait *between* runs. `30s`, `10m`, `2h`, or bare seconds. |
| `prompt` | The prompt to type into Claude. Quote it. |
| `idle-seconds` | *(optional, default `5`)* How long the output stream must be silent before assuming Claude is done. |

### Examples

```bash
# Every 30 minutes, ask Claude to summarize the market
claude-cron 30m "summarize today's market news"

# Every 2 hours, longer idle threshold for slow tool calls
claude-cron 2h "check for new SEC filings on AAPL and summarize" 15

# Quick smoke test
claude-cron 30s "say hi in three words"
```

Stop the loop with **Ctrl+C**.

## How it works

Claude Code is an interactive TUI — it never exits on its own. ClaudeCron spawns it inside a pseudo-terminal (PTY) and watches the output stream:

1. After ~2s of initial quiet, Claude is at the input box → type the prompt.
2. While Claude works, the spinner and gradient keep the stream busy → keep waiting.
3. After `idle-seconds` of total silence, the response is finished → send Ctrl+C, then kill the process.
4. Sleep `interval`, then repeat.

If a prompt triggers tool calls with long quiet stretches (slow web fetches, big builds), raise `idle-seconds`.

## Development

```bash
npm install
npm run build      # tsc → dist/
node dist/cli.js 30s "say hi"
```

## License

MIT
