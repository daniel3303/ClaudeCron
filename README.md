# ClaudeCron

Run [Claude Code](https://www.anthropic.com/claude-code) on a schedule.

`claude-cron` drives Claude in two modes:

- **restart** — fire a one-shot prompt, kill the process, sleep, repeat. No context carries between runs.
- **clear** — spawn one long-lived Claude, send a prompt, and every N minutes type `/clear` and re-send the prompt to wipe accumulated context without losing the loop.

## Install

```bash
npm install -g claude-cron
```

Requires Node 20+ and `claude` on your `PATH`.

## Usage

```bash
claude-cron restart <interval> "<prompt>" [idle-seconds]
claude-cron clear   <interval> "<prompt>"
claude-cron         <interval> "<prompt>" [idle-seconds]   # legacy, = restart
```

| Arg | Meaning |
| --- | --- |
| `interval` | `30s`, `10m`, `2h`, or bare seconds. |
| `prompt` | The prompt to type into Claude. Quote it. |
| `idle-seconds` | *(restart only, default `5`)* How long the output must be silent before Claude is considered done. |

Stop the loop with **Ctrl+C**.

### restart mode

Every `interval`, ClaudeCron spawns a fresh Claude, sends the prompt, waits for the response to finish, kills the process, and sleeps. Use this when each run is a discrete task and conversation context should NOT carry across runs.

```bash
# Every 30 minutes, summarize the market in a fresh session
claude-cron restart 30m "summarize today's market news"

# Every 2 hours, longer idle threshold for slow tool calls
claude-cron restart 2h "check for new SEC filings on AAPL and summarize" 15

# Quick smoke test
claude-cron restart 30s "say hi in three words"
```

### clear mode

ClaudeCron spawns **one** Claude session, sends the prompt once, and every `interval` types `/clear` followed by the prompt again. The Claude process stays alive between cycles; only the conversation history is dropped.

Best paired with `/loop`, where the prompt itself is the long-running task and you only want to prevent its context from growing unbounded across hours of runtime.

```bash
# Run /improve-code once a minute forever, with a context reset every 30 minutes
claude-cron clear 30m "/loop 1m /improve-code"

# Same idea, hourly reset
claude-cron clear 1h "/loop 5m /add-test"
```

### Legacy form

The original positional form still works and is treated as `restart`:

```bash
claude-cron 30m "summarize today's market news"
# equivalent to:
claude-cron restart 30m "summarize today's market news"
```

## How it works

Claude Code is an interactive TUI — it never exits on its own. ClaudeCron spawns it inside a pseudo-terminal (PTY) and watches the output stream:

**restart mode**
1. After ~2s of initial quiet, Claude is at the input box → type the prompt.
2. While Claude works, the spinner and gradient keep the stream busy → keep waiting.
3. After `idle-seconds` of total silence, the response is finished → send Ctrl+C, then kill the process.
4. Sleep `interval`, then repeat.

If a prompt triggers tool calls with long quiet stretches (slow web fetches, big builds), raise `idle-seconds`.

**clear mode**
1. After ~2s of initial quiet, type the prompt.
2. Sleep `interval`.
3. Type `/clear`, wait for the next ~2s of quiet, type the prompt again.
4. Goto 2. The Claude process is never killed until you Ctrl+C.

## Development

```bash
npm install
npm run build      # tsc → dist/
node dist/cli.js restart 30s "say hi"
node dist/cli.js clear   30s "/loop 1m say hi"
```

## License

MIT
