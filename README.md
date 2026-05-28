# ClaudeCron

Run [Claude Code](https://www.anthropic.com/claude-code) on a schedule — without burning your context window.

![claude-cron restart mode — fresh Claude session every 5s](docs/demo.gif)

`claude-cron` drives Claude in two modes:

- **restart** — fire a one-shot prompt, kill the process, sleep, repeat. No context carries between runs.
- **clear** — spawn one long-lived Claude, send a prompt, and every N minutes type `/clear` and re-send the prompt to wipe accumulated context without losing the loop.

## Why

If you've tried scheduling a recurring task *inside* Claude Code itself — e.g. `/loop 1m "check the deploy"` — you've probably hit two problems:

- **Token cost climbs every tick.** Each iteration keeps appending to the same session, so the context (and the per-tick cost) grows without bound. After an hour of `/loop 1m`, every run is paying for a huge cached prefix it doesn't actually need.
- **It eventually breaks.** Once the context gets large enough that auto-compaction can't keep up — or fails outright — the loop stalls, derails, or stops responding.

`claude-cron` sidesteps both by managing the loop *outside* the conversation:

- **restart mode** spawns a brand-new Claude session every tick. Context starts empty each time, so per-run token cost is flat no matter how long the loop has been running.
- **clear mode** keeps `/loop` itself but resets the session's context every N minutes via `/clear`, so the inner loop never gets the chance to blow up.

Either way, the outer scheduler is a tiny Node process that won't degrade under context pressure — it just keeps ticking. Stick with raw `/loop` only when each run genuinely needs to *remember* the previous ones.

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

## License

MIT
