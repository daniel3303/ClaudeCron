import type { IPty } from 'node-pty';

/**
 * Forward terminal resize events to the running child PTY so the embedded
 * Claude TUI re-renders to the new size when the user resizes their terminal
 * or splits a tmux/iTerm pane. Without this the child keeps whatever size it
 * was spawned with and the layout breaks on resize.
 *
 * Returns a teardown function that detaches the listener. Safe to call when
 * stdout isn't a TTY (returns a no-op teardown).
 */
export function setupResizeForwarding(getChild: () => IPty | null): () => void {
  if (!process.stdout.isTTY) return () => { /* nothing to detach */ };

  const onResize = (): void => {
    const cols = process.stdout.columns;
    const rows = process.stdout.rows;
    if (!cols || !rows) return;
    try {
      getChild()?.resize(cols, rows);
    } catch {
      // child already exited; ignore
    }
  };
  process.stdout.on('resize', onResize);

  return () => {
    process.stdout.off('resize', onResize);
  };
}
