// ─────────────────────────────────────────────────
// ReactiveStore: Observable wrapper for state sync
// Enables UI components to subscribe to data changes
// ─────────────────────────────────────────────────

type Listener<T> = (state: T) => void;
type Unsubscribe = () => void;

/**
 * A lightweight reactive store with pub/sub pattern.
 * Wraps any state object and notifies subscribers on changes.
 */
export class ReactiveStore<T> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initialState: T) {
    this.state = initialState;
  }

  /** Get current state snapshot (immutable reference) */
  getState(): T {
    return this.state;
  }

  /** Update state and notify all subscribers */
  setState(updater: Partial<T> | ((prev: T) => T)): void {
    if (typeof updater === 'function') {
      this.state = (updater as (prev: T) => T)(this.state);
    } else {
      this.state = { ...this.state, ...updater };
    }
    this.notify();
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Get the number of active subscribers */
  getSubscriberCount(): number {
    return this.listeners.size;
  }

  /** Notify all listeners of current state */
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[ReactiveStore] Listener error:', err);
      }
    }
  }

  /** Remove all subscribers */
  destroy(): void {
    this.listeners.clear();
  }
}

// ─── Multi-Tab Sync via BroadcastChannel ─────────

/**
 * Creates a BroadcastChannel-backed store that syncs state across browser tabs.
 * When state changes in one tab, all other tabs receive the update.
 */
export class SyncedStore<T> extends ReactiveStore<T> {
  private channel: BroadcastChannel | null = null;
  private channelName: string;

  constructor(channelName: string, initialState: T) {
    super(initialState);
    this.channelName = channelName;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'STATE_UPDATE') {
          // Update local state without re-broadcasting
          super.setState(event.data.state);
        }
      };
    }
  }

  /** Override setState to broadcast changes to other tabs */
  override setState(updater: Partial<T> | ((prev: T) => T)): void {
    super.setState(updater);

    // Broadcast to other tabs
    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'STATE_UPDATE',
          state: this.getState(),
        });
      } catch {
        // BroadcastChannel may fail if data is not cloneable
      }
    }
  }

  /** Clean up BroadcastChannel */
  override destroy(): void {
    super.destroy();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
