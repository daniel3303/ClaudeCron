const UNIT_TO_SECONDS: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600 };

export function parseInterval(input: string): number {
  const match = /^(\d+(?:\.\d+)?)([smh]?)$/.exec(input);
  if (!match) {
    throw new Error(`invalid interval: "${input}" (use 30s, 10m, 2h, or bare seconds)`);
  }
  const seconds = Number(match[1]) * UNIT_TO_SECONDS[match[2]];
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`invalid interval: "${input}"`);
  }
  return seconds;
}
