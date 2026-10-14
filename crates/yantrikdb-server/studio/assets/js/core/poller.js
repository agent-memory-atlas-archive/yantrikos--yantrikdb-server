/** Interval poller that pauses while the tab is hidden. */

export function createPoller(task) {
  let timer = null;
  let running = false;
  return {
    start(intervalMs) {
      this.stop();
      if (intervalMs > 0) timer = setInterval(() => !document.hidden && this.tick(), intervalMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    /** Run now; overlapping runs are dropped, not queued. */
    async tick() {
      if (running) return;
      running = true;
      try {
        await task();
      } finally {
        running = false;
      }
    },
    get active() {
      return timer !== null;
    },
  };
}
