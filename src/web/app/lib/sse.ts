/** SSE client with exponential backoff.
 *
 * Opens /events relative to document.baseURI. Any message from the server
 * triggers the provided onReload callback. On disconnect, reconnects with
 * backoff: 1s → 2s → 5s → 15s → 30s cap.
 */

const BACKOFF_MS = [1000, 2000, 5000, 15000, 30000];

export interface SseHandle {
  close(): void;
}

export function startSse(onReload: () => void): SseHandle | null {
  // Skip in environments where live reload makes no sense.
  if (typeof EventSource === "undefined") return null;
  if (window.location.protocol === "file:") return null;

  let attempts = 0;
  let source: EventSource | null = null;
  let reconnectTimer: number | null = null;
  let closed = false;

  const connect = (): void => {
    if (closed) return;
    const url = new URL("events", document.baseURI).toString();
    try {
      source = new EventSource(url);
    } catch {
      scheduleReconnect();
      return;
    }
    source.onopen = () => {
      attempts = 0;
    };
    source.onmessage = () => {
      onReload();
    };
    source.onerror = () => {
      // EventSource will try to reconnect on its own, but we want to cap
      // attempts and honor a shutdown. Close and schedule manually.
      if (source) {
        source.close();
        source = null;
      }
      scheduleReconnect();
    };
  };

  const scheduleReconnect = (): void => {
    if (closed) return;
    const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
    attempts += 1;
    reconnectTimer = window.setTimeout(connect, delay);
  };

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (source) source.close();
    },
  };
}
