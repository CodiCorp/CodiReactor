// ─────────────────────────────────────────────────
// Tests: Lexa AI Service
// ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LexaAI, fillPrompt, DEFAULT_PROMPTS,
  type AIProvider,
} from '../src/ai/lexaAI';

// Mock provider
class MockProvider implements AIProvider {
  id = 'mock';
  name = 'Mock Provider';
  queryFn = vi.fn().mockResolvedValue('Mock AI response');

  async query(prompt: string): Promise<string> {
    return this.queryFn(prompt);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

describe('fillPrompt', () => {
  it('replaces {WORD} placeholder', () => {
    const result = fillPrompt('Define "{WORD}"', 'hello', '', 'English');
    expect(result).toBe('Define "hello"');
  });

  it('replaces {CONTEXT} placeholder', () => {
    const result = fillPrompt('In: "{CONTEXT}"', 'hello', 'Hello world', 'English');
    expect(result).toBe('In: "Hello world"');
  });

  it('replaces {USER_LANG} placeholder', () => {
    const result = fillPrompt('Explain in {USER_LANG}', 'hello', '', 'Arabic');
    expect(result).toBe('Explain in Arabic');
  });

  it('replaces multiple occurrences', () => {
    const result = fillPrompt('{WORD} is {WORD}', 'hello', '', 'English');
    expect(result).toBe('hello is hello');
  });
});

describe('LexaAI', () => {
  let lexa: LexaAI;
  let mockProvider: MockProvider;

  beforeEach(() => {
    lexa = new LexaAI();
    mockProvider = new MockProvider();
    lexa.addProvider(mockProvider);
  });

  it('registers providers', () => {
    expect(lexa.getProviders()).toHaveLength(1);
    expect(lexa.getActiveProvider()?.id).toBe('mock');
  });

  it('auto-selects first provider as active', () => {
    const provider = lexa.getActiveProvider();
    expect(provider).not.toBeNull();
    expect(provider!.id).toBe('mock');
  });

  it('switches active provider', () => {
    const second = new MockProvider();
    second.id = 'second';
    lexa.addProvider(second);

    lexa.setActiveProvider('second');
    expect(lexa.getActiveProvider()?.id).toBe('second');
  });

  it('sends query to active provider', async () => {
    const result = await lexa.query('test prompt');
    expect(result).toBe('Mock AI response');
    expect(mockProvider.queryFn).toHaveBeenCalledWith('test prompt');
  });

  it('caches responses', async () => {
    await lexa.query('same prompt');
    await lexa.query('same prompt');

    // Should only call provider once due to caching
    expect(mockProvider.queryFn).toHaveBeenCalledTimes(1);
  });

  it('clears cache', async () => {
    await lexa.query('prompt');
    lexa.clearCache();
    await lexa.query('prompt');

    expect(mockProvider.queryFn).toHaveBeenCalledTimes(2);
  });

  it('explain sends filled explain prompt', async () => {
    await lexa.explain('hello', 'Hello world', 'English');

    const calledPrompt = mockProvider.queryFn.mock.calls[0][0] as string;
    expect(calledPrompt).toContain('hello');
    expect(calledPrompt).toContain('Hello world');
    expect(calledPrompt).toContain('English');
  });

  it('getExamples sends filled examples prompt', async () => {
    await lexa.getExamples('run', 'I run fast', 'Arabic');

    const calledPrompt = mockProvider.queryFn.mock.calls[0][0] as string;
    expect(calledPrompt).toContain('run');
    expect(calledPrompt).toContain('Arabic');
  });

  it('analyzeGrammar sends filled grammar prompt', async () => {
    await lexa.analyzeGrammar('the', 'The cat sat', 'English');

    const calledPrompt = mockProvider.queryFn.mock.calls[0][0] as string;
    expect(calledPrompt).toContain('the');
    expect(calledPrompt).toContain('The cat sat');
  });

  it('throws when no provider configured', async () => {
    const emptyLexa = new LexaAI();
    await expect(emptyLexa.query('test')).rejects.toThrow('No AI provider');
  });

  it('throws when provider unavailable', async () => {
    const unavailable = new MockProvider();
    unavailable.isAvailable = vi.fn().mockResolvedValue(false);

    const lexa2 = new LexaAI();
    lexa2.addProvider(unavailable);

    await expect(lexa2.query('test')).rejects.toThrow('not available');
  });

  it('updates prompt templates', async () => {
    lexa.setPrompts({ explain: 'Custom: {WORD}' });
    await lexa.explain('test', 'ctx', 'en');

    const calledPrompt = mockProvider.queryFn.mock.calls[0][0] as string;
    expect(calledPrompt).toBe('Custom: test');
  });
});
