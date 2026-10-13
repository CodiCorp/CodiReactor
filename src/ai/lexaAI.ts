// ─────────────────────────────────────────────────
// AI Services: Pluggable LLM provider architecture
// Lexa AI Engine for dictionary explanations,
// examples, and grammar analysis
// ─────────────────────────────────────────────────

/** AI Provider interface — all providers implement this */
export interface AIProvider {
  id: string;
  name: string;
  query(prompt: string): Promise<string>;
  isAvailable(): Promise<boolean>;
}

/** Ollama local LLM provider */
export class OllamaProvider implements AIProvider {
  id = 'ollama';
  name = 'Ollama (Local)';
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama3') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async query(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
    const data = await response.json();
    return data.response || '';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/** Google Gemini provider */
export class GeminiProvider implements AIProvider {
  id = 'gemini';
  name = 'Google Gemini';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async query(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}

/** OpenAI GPT provider */
export class OpenAIProvider implements AIProvider {
  id = 'openai';
  name = 'OpenAI GPT';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async query(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}

// ─── Prompt Templates ────────────────────────────

export interface PromptTemplates {
  explain: string;
  examples: string;
  grammar: string;
}

export const DEFAULT_PROMPTS: PromptTemplates = {
  explain: 'In this sentence "{CONTEXT}", explain the usage of "{WORD}" in {USER_LANG}. Keep under 80 words.',
  examples: 'Give 5 example sentences using "{WORD}" in the same nuance as in: "{CONTEXT}". In {USER_LANG}.',
  grammar: 'Analyze the grammatical role of "{WORD}" in: "{CONTEXT}". Explain morphology in {USER_LANG}.',
};

/**
 * Fill a prompt template with values.
 */
export function fillPrompt(
  template: string,
  word: string,
  context: string,
  userLang: string = 'English',
): string {
  return template
    .replace(/{WORD}/g, word)
    .replace(/{CONTEXT}/g, context)
    .replace(/{USER_LANG}/g, userLang);
}

// ─── Lexa AI Service ─────────────────────────────

/**
 * Lexa AI Engine: manages providers, sends queries, caches results.
 */
export class LexaAI {
  private providers: AIProvider[] = [];
  private activeProviderId: string | null = null;
  private cache: Map<string, string> = new Map();
  private prompts: PromptTemplates;

  constructor(prompts: PromptTemplates = DEFAULT_PROMPTS) {
    this.prompts = prompts;
  }

  /** Register an AI provider */
  addProvider(provider: AIProvider): void {
    this.providers.push(provider);
    if (!this.activeProviderId) {
      this.activeProviderId = provider.id;
    }
  }

  /** Alias for addProvider */
  registerProvider(provider: AIProvider): void {
    this.addProvider(provider);
  }

  /** Alias for explain */
  async explainWord(word: string, context: string, userLang: string = 'English'): Promise<string> {
    return this.explain(word, context, userLang);
  }

  /** Alias for analyzeGrammar */
  async explainGrammar(word: string, context: string, userLang: string = 'English'): Promise<string> {
    return this.analyzeGrammar(word, context, userLang);
  }

  /** Set the active provider */
  setActiveProvider(providerId: string): void {
    const found = this.providers.find(p => p.id === providerId);
    if (found) {
      this.activeProviderId = providerId;
    }
  }

  /** Get available providers */
  getProviders(): AIProvider[] {
    return this.providers;
  }

  /** Get active provider */
  getActiveProvider(): AIProvider | null {
    return this.providers.find(p => p.id === this.activeProviderId) || null;
  }

  /** Send an explain query */
  async explain(word: string, context: string, userLang: string = 'English'): Promise<string> {
    const prompt = fillPrompt(this.prompts.explain, word, context, userLang);
    return this.query(prompt);
  }

  /** Send an examples query */
  async getExamples(word: string, context: string, userLang: string = 'English'): Promise<string> {
    const prompt = fillPrompt(this.prompts.examples, word, context, userLang);
    return this.query(prompt);
  }

  /** Send a grammar query */
  async analyzeGrammar(word: string, context: string, userLang: string = 'English'): Promise<string> {
    const prompt = fillPrompt(this.prompts.grammar, word, context, userLang);
    return this.query(prompt);
  }

  /** Send a raw query to the active provider */
  async query(prompt: string): Promise<string> {
    // Check cache
    const cached = this.cache.get(prompt);
    if (cached) return cached;

    const provider = this.getActiveProvider();
    if (!provider) throw new Error('No AI provider configured');

    const available = await provider.isAvailable();
    if (!available) throw new Error(`Provider "${provider.name}" is not available`);

    const result = await provider.query(prompt);

    // Cache result
    this.cache.set(prompt, result);

    return result;
  }

  /** Clear the response cache */
  clearCache(): void {
    this.cache.clear();
  }

  /** Update prompt templates */
  setPrompts(prompts: Partial<PromptTemplates>): void {
    this.prompts = { ...this.prompts, ...prompts };
  }
}
