import type { IPty } from 'node-pty';

const CTRL_C_BYTE = 0x03;

/**
 * Forward stdin to the running child PTY so the user can interact with the
 * embedded Claude session as if they'd launched it directly. Ctrl+C is
 * intercepted and turned into an `onInterrupt()` callback rather than being
 * forwarded — that way the parent gets a chance to tear the loop down
 * cleanly instead of the child eating the signal.
 *
 * Returns a teardown function that restores stdin to its prior state.
 * Safe to call when stdin isn't a TTY (returns a no-op teardown).
 */
export function setupStdinForwarding(
  getChild: () => IPty | null,
  onInterrupt: () => void
): () => void {
  if (!process.stdin.isTTY) return () => { /* nothing to restore */ };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  const onData = (data: Buffer): void => {
    if (data.length === 1 && data[0] === CTRL_C_BYTE) {
      onInterrupt();
      return;
    }
    getChild()?.write(data.toString());
  };
  process.stdin.on('data', onData);

  return () => {
    process.stdin.off('data', onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}
