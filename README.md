# ClaudeCodeCron

Run [Claude Code](https://www.anthropic.com/claude-code) on a schedule — without burning your context window, and without leaving your subscription bucket.

![claude-cron restart mode — fresh Claude session every 5s](docs/demo.gif)

> **Heads up — June 15, 2026.** Anthropic moves `claude -p`, the Agent SDK, and Claude Code GitHub Actions off subscription limits onto a separate monthly credit pool ($20 Pro / $100 Max 5x / $200 Max 20x) at API list prices. Interactive Claude Code stays on the subscription — and so does `claude-code-cron`, since it drives the interactive TUI. ([Anthropic announcement](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan))

`claude-cron` drives Claude in three modes:

- **restart** — fire a one-shot prompt, kill the process, sleep, repeat. No context carries between runs.
- **clear** — spawn one long-lived Claude, send a prompt, and every N minutes type `/clear` and re-send the prompt to wipe accumulated context without losing the loop.
- **compact** — same shape as clear, but sends `/compact` instead of `/clear` so Claude summarises the context rather than wiping it. Use when you DO want runs to remember each other.

## Why

If you've tried scheduling a recurring task *inside* Claude Code itself — e.g. `/loop 1m "check the deploy"` — you've probably hit two problems:

- **Token cost climbs every tick.** Each iteration keeps appending to the same session, so the context (and the per-tick cost) grows without bound. After an hour of `/loop 1m`, every run is paying for a huge cached prefix it doesn't actually need.
- **It eventually breaks.** Once the context gets large enough that auto-compaction can't keep up — or fails outright — the loop stalls, derails, or stops responding.

`claude-cron` sidesteps both by managing the loop *outside* the conversation:

- **restart mode** spawns a brand-new Claude session every tick. Context starts empty each time, so per-run token cost is flat no matter how long the loop has been running.
- **clear mode** keeps `/loop` itself but resets the session's context every N minutes via `/clear`, so the inner loop never gets the chance to blow up.
- **compact mode** sits between the two — keeps the loop running and the session alive, but every N minutes sends `/compact` so Claude summarises rather than discards what came before. Pick this when later runs genuinely need to remember earlier ones.

The outer scheduler is a tiny Node process that won't degrade under context pressure — it just keeps ticking. Stick with raw `/loop` only when you specifically need the model to track every single iteration verbatim.

## Install

```bash
npm install -g claude-code-cron
```

Requires Node 20+ and `claude` on your `PATH`.

## Usage

```bash
claude-cron restart <interval> "<prompt>" [idle-seconds]
claude-cron clear   <interval> "<prompt>"
claude-cron compact <interval> "<prompt>"
```

| Arg | Meaning |
| --- | --- |
| `interval` | `30s`, `10m`, `2h`, or bare seconds. |
| `prompt` | The prompt to type into Claude. Quote it. |
| `idle-seconds` | *(restart only, default `5`)* How long the output must be silent before Claude is considered done. |

Stop the loop with **Ctrl+C**.

### restart mode

Every `interval`, ClaudeCodeCron spawns a fresh Claude, sends the prompt, waits for the response to finish, kills the process, and sleeps. Use this when each run is a discrete task and conversation context should NOT carry across runs.

```bash
# Every 30 minutes, summarize the market in a fresh session
claude-cron restart 30m "summarize today's market news"

# Every 2 hours, longer idle threshold for slow tool calls
claude-cron restart 2h "check for new SEC filings on AAPL and summarize" 15

# Quick smoke test
claude-cron restart 30s "say hi in three words"
```

### clear mode

ClaudeCodeCron spawns **one** Claude session, sends the prompt once, and every `interval` types `/clear` followed by the prompt again. The Claude process stays alive between cycles; only the conversation history is dropped.

Best paired with `/loop`, where the prompt itself is the long-running task and you only want to prevent its context from growing unbounded across hours of runtime.

```bash
# Run /improve-code once a minute forever, with a context reset every 30 minutes
claude-cron clear 30m "/loop 1m /improve-code"

# Same idea, hourly reset
claude-cron clear 1h "/loop 5m /add-test"
```

### compact mode

Identical to clear mode in structure — one long-lived Claude session, prompt sent on startup, a slash command fired every `interval` — except it sends `/compact` instead of `/clear`. Claude summarises the conversation history into a shorter form rather than throwing it away, so later runs still see the gist of earlier ones.

Use this when the inner `/loop` builds up *useful* state across iterations (a running list, a tracked target, an evolving plan) and you only want to keep the token count manageable — not reset the loop's memory.

```bash
# Add tests in a /loop forever, summarise context every hour
claude-cron compact 1h "/loop 5m /add-test"

# Watch a deploy queue, summarise every two hours to keep history but stop bloat
claude-cron compact 2h "/loop 5m check the deploy queue and tell me what changed"
```

## License

MIT
