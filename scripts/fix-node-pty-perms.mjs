#!/usr/bin/env node
// node-pty's published prebuilt `spawn-helper` ships without an execute bit
// on Unix platforms — npm extracts it as 0644, so `posix_spawnp` then fails
// with EACCES, surfaced as "posix_spawnp failed. this can never happen".
// Re-apply +x after install. No-op on Windows (no spawn-helper in those prebuilds).
import { readdirSync, statSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prebuildsDir = join(here, '..', 'node_modules', 'node-pty', 'prebuilds');

let fixed = 0;
try {
  for (const platform of readdirSync(prebuildsDir)) {
    const helper = join(prebuildsDir, platform, 'spawn-helper');
    try {
      const s = statSync(helper);
      if (!(s.mode & 0o111)) {
        chmodSync(helper, s.mode | 0o755);
        fixed++;
      }
    } catch {
      // no spawn-helper for this platform (Windows) — skip
    }
  }
} catch {
  // node-pty not on disk yet (e.g., bare clone) — nothing to fix
}

if (fixed > 0) {
  console.log(`[claude-cron] re-applied +x to ${fixed} node-pty spawn-helper binar${fixed === 1 ? 'y' : 'ies'}`);
}
