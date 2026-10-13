// ─────────────────────────────────────────────────
// Tests: Aria Chat Engine
// ─────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { AriaChatEngine, PRESET_SCENARIOS } from '../src/ai/ariaChat';
import { AIProvider } from '../src/ai/lexaAI';

describe('AriaChatEngine', () => {
  const mockProvider: AIProvider = {
    id: 'mock',
    name: 'Mock LLM',
    query: vi.fn(async (prompt: string) => {
      if (prompt.includes('Roleplay Scenario')) {
        return 'Sure! I can definitely make you an oat milk latte. Anything else?';
      }
      return 'Hello there!';
    }),
    isAvailable: vi.fn(async () => true),
  };

  it('initializes with default coffee shop scenario and starter prompt', () => {
    const engine = new AriaChatEngine(null);
    const messages = engine.getMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toContain('Sunrise Cafe');
  });

  it('builds system prompt weaving user learning words and CEFR level', () => {
    const engine = new AriaChatEngine(null, {
      userLevel: 'B2',
      learningWords: ['serendipity', 'perseverance', 'ubiquitous'],
      nativeLanguage: 'Arabic',
    });

    const prompt = engine.buildSystemPrompt();
    expect(prompt).toContain('User CEFR Level: B2');
    expect(prompt).toContain('serendipity, perseverance, ubiquitous');
    expect(prompt).toContain('User Native Language: Arabic');
  });

  it('sends message using AI provider and detects highlighted learning words', async () => {
    const engine = new AriaChatEngine(mockProvider, {
      learningWords: ['latte', 'espresso', 'oat milk'],
    });

    const response = await engine.sendMessage('I would like an espresso and an oat milk pastry please.');

    expect(response.role).toBe('assistant');
    expect(response.content).toContain('latte');
    expect(mockProvider.query).toHaveBeenCalled();

    const messages = engine.getMessages();
    expect(messages).toHaveLength(3); // starter, user, assistant
    expect(messages[1].highlightedWords).toContain('espresso');
    expect(messages[1].highlightedWords).toContain('oat milk');
  });

  it('uses fallback response when provider is null', async () => {
    const engine = new AriaChatEngine(null, {
      currentScenario: PRESET_SCENARIOS[0],
    });

    const response = await engine.sendMessage('Can I have a hot tea please?');
    expect(response.role).toBe('assistant');
    expect(response.content).toContain('Would you like a receipt with that');
  });

  it('switches scenario and resets conversation with new starter', () => {
    const engine = new AriaChatEngine(null);
    const interviewScenario = PRESET_SCENARIOS.find(s => s.id === 'job_interview')!;

    engine.updateConfig({ currentScenario: interviewScenario });
    const messages = engine.getMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('why you applied');
  });

  it('throws error when sending empty message', async () => {
    const engine = new AriaChatEngine(null);
    await expect(engine.sendMessage('   ')).rejects.toThrow('Message cannot be empty');
  });
});
