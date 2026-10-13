// ─────────────────────────────────────────────────
// Tests: ReactiveStore & SyncedStore
// ─────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { ReactiveStore, SyncedStore } from '../src/core/storage/reactiveStore';

describe('ReactiveStore', () => {
  it('returns initial state', () => {
    const store = new ReactiveStore({ count: 0 });
    expect(store.getState().count).toBe(0);
  });

  it('updates state with partial object', () => {
    const store = new ReactiveStore({ count: 0, name: 'test' });
    store.setState({ count: 5 });
    expect(store.getState().count).toBe(5);
    expect(store.getState().name).toBe('test');
  });

  it('updates state with function', () => {
    const store = new ReactiveStore({ count: 0 });
    store.setState(prev => ({ count: prev.count + 1 }));
    expect(store.getState().count).toBe(1);
  });

  it('notifies subscribers on state change', () => {
    const store = new ReactiveStore({ count: 0 });
    const listener = vi.fn();

    store.subscribe(listener);
    store.setState({ count: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ count: 1 });
  });

  it('supports multiple subscribers', () => {
    const store = new ReactiveStore({ count: 0 });
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    store.subscribe(listener1);
    store.subscribe(listener2);
    store.setState({ count: 1 });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes correctly', () => {
    const store = new ReactiveStore({ count: 0 });
    const listener = vi.fn();

    const unsub = store.subscribe(listener);
    unsub();
    store.setState({ count: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks subscriber count', () => {
    const store = new ReactiveStore({ count: 0 });
    expect(store.getSubscriberCount()).toBe(0);

    const unsub1 = store.subscribe(() => {});
    expect(store.getSubscriberCount()).toBe(1);

    const unsub2 = store.subscribe(() => {});
    expect(store.getSubscriberCount()).toBe(2);

    unsub1();
    expect(store.getSubscriberCount()).toBe(1);
  });

  it('handles listener errors gracefully', () => {
    const store = new ReactiveStore({ count: 0 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.subscribe(() => { throw new Error('boom'); });
    store.subscribe(vi.fn()); // Should still be called

    expect(() => store.setState({ count: 1 })).not.toThrow();
    errorSpy.mockRestore();
  });

  it('destroys all subscribers', () => {
    const store = new ReactiveStore({ count: 0 });
    const listener = vi.fn();

    store.subscribe(listener);
    store.destroy();
    store.setState({ count: 1 });

    expect(listener).not.toHaveBeenCalled();
    expect(store.getSubscriberCount()).toBe(0);
  });
});

describe('SyncedStore', () => {
  it('behaves like ReactiveStore', () => {
    const store = new SyncedStore('test-channel', { count: 0 });
    store.setState({ count: 5 });
    expect(store.getState().count).toBe(5);
  });

  it('notifies subscribers', () => {
    const store = new SyncedStore('test-channel-2', { count: 0 });
    const listener = vi.fn();

    store.subscribe(listener);
    store.setState({ count: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('cleans up on destroy', () => {
    const store = new SyncedStore('test-channel-3', { count: 0 });
    store.destroy();
    expect(store.getSubscriberCount()).toBe(0);
  });
});
