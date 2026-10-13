// ─────────────────────────────────────────────────
// Tests: IPC MessageBus
// ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBus, resetMessageBus } from '../src/core/ipc/messageBus';

let bus: MessageBus;

beforeEach(() => {
  resetMessageBus();
  bus = new MessageBus('content');
});

describe('MessageBus', () => {
  it('registers and triggers handlers', () => {
    const handler = vi.fn();
    bus.on('PING', handler);

    bus.send({ type: 'PING', payload: { data: 'test' } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PING', payload: { data: 'test' } }),
    );
  });

  it('supports multiple handlers for same message type', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('PING', handler1);
    bus.on('PING', handler2);

    bus.send({ type: 'PING', payload: null });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('unregisters handlers correctly', () => {
    const handler = vi.fn();
    const unsubscribe = bus.on('PING', handler);

    unsubscribe();
    bus.send({ type: 'PING', payload: null });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not trigger handlers for different message types', () => {
    const handler = vi.fn();
    bus.on('PING', handler);

    bus.send({ type: 'PONG', payload: null });

    expect(handler).not.toHaveBeenCalled();
  });

  it('assigns unique requestIds to messages', async () => {
    const ids: string[] = [];
    bus.on('PING', (msg) => { ids.push(msg.requestId!); });

    await bus.send({ type: 'PING', payload: null });
    await bus.send({ type: 'PING', payload: null });

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('handles DICTIONARY_LOOKUP → DICTIONARY_RESULT flow', () => {
    const lookupHandler = vi.fn();
    const resultHandler = vi.fn();

    bus.on('DICTIONARY_LOOKUP', lookupHandler);
    bus.on('DICTIONARY_RESULT', resultHandler);

    bus.send({ type: 'DICTIONARY_LOOKUP', payload: { word: 'hello' } });

    expect(lookupHandler).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { word: 'hello' } }),
    );
  });

  it('destroys all handlers', () => {
    const handler = vi.fn();
    bus.on('PING', handler);

    bus.destroy();
    bus.send({ type: 'PING', payload: null });

    expect(handler).not.toHaveBeenCalled();
  });
});
