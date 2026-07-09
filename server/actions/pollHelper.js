// Shared "poll a service on an interval while at least one key instance is
// visible" pattern used by the audio/controller/performance action modules.
// Extracted because those three are otherwise identical apart from the fetch
// function and the render callback — the polling only runs while at least
// one bound key is on screen, and stops the moment the last one leaves.
function createPoller(fetchFn, intervalMs, onUpdate) {
  const liveCtxs = new Set();
  let timer = null;
  let last = null;

  async function tick() {
    try {
      const next = await fetchFn();
      if (JSON.stringify(next) === JSON.stringify(last)) return;
      last = next;
      liveCtxs.forEach((ctx) => onUpdate(ctx, next));
    } catch (e) {
      console.error('poll failed:', e.message);
    }
  }

  return {
    async attach(ctx) {
      liveCtxs.add(ctx);
      if (last) onUpdate(ctx, last);
      if (!timer) {
        timer = setInterval(tick, intervalMs);
        await tick();
      }
    },
    detach(ctx) {
      liveCtxs.delete(ctx);
      if (liveCtxs.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
        last = null;
      }
    },
    getLast: () => last,
    // Used by getPanelData/onPanelAction when no key bound to this action is
    // currently visible (so the interval isn't running): fetches once and
    // caches into `last`, so a subsequent onPanelAction validates against a
    // real snapshot instead of skipping validation because nothing was cached.
    async getLastOrFetch() {
      if (last == null) {
        try {
          last = await fetchFn();
        } catch (e) {
          console.error('poll fetch failed:', e.message);
        }
      }
      return last;
    },
    // Called after a panel action changes the underlying state (e.g.
    // switching the audio output) so the next getPanelData/onPanelAction
    // call re-fetches instead of showing what's now a stale cached value.
    invalidate() {
      last = null;
    },
  };
}

module.exports = { createPoller };
