// ─────────────────────────────────────────────────
// Aria Chat: Conversational AI Partner with scenario
// cards, learning word weaving, and voice readiness
// ─────────────────────────────────────────────────

import { AIProvider } from './lexaAI';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  highlightedWords?: string[];
  feedback?: string;
}

export interface ScenarioCard {
  id: string;
  title: string;
  description: string;
  category: 'daily' | 'travel' | 'work' | 'social' | 'academic';
  targetRole: string;
  userRole: string;
  starterPrompt: string;
  suggestedVocabulary?: string[];
}

export interface AriaChatConfig {
  targetLanguage: string;
  nativeLanguage: string;
  userLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  learningWords: string[];
  currentScenario?: ScenarioCard;
  correctMistakes: boolean;
}

export const PRESET_SCENARIOS: ScenarioCard[] = [
  {
    id: 'coffee_shop',
    title: 'Ordering at a Cafe',
    description: 'Order your favorite drink and pastry, ask about ingredients, and pay.',
    category: 'daily',
    targetRole: 'Friendly Barista',
    userRole: 'Customer',
    starterPrompt: 'Hi there! Welcome to the Sunrise Cafe. What can I get started for you today?',
    suggestedVocabulary: ['espresso', 'oat milk', 'receipt', 'pastry', 'recommend'],
  },
  {
    id: 'job_interview',
    title: 'Job Interview',
    description: 'Answer questions about your experience, strengths, and discuss role expectations.',
    category: 'work',
    targetRole: 'Hiring Manager',
    userRole: 'Candidate',
    starterPrompt: 'Thank you for coming in today. Could you tell me a little bit about yourself and why you applied?',
    suggestedVocabulary: ['experience', 'collaborate', 'challenge', 'accomplish', 'initiative'],
  },
  {
    id: 'airport_customs',
    title: 'Airport Customs & Passport Control',
    description: 'Answer questions about the purpose of your trip, duration of stay, and declare items.',
    category: 'travel',
    targetRole: 'Customs Officer',
    userRole: 'Traveler',
    starterPrompt: 'Good evening. Passport and boarding pass, please. What is the purpose of your visit?',
    suggestedVocabulary: ['declaration', 'transit', 'luggage', 'accommodation', 'duration'],
  },
  {
    id: 'doctor_visit',
    title: 'Doctor Consultation',
    description: 'Explain symptoms, medical history, and ask questions about remedies.',
    category: 'daily',
    targetRole: 'Attending Physician',
    userRole: 'Patient',
    starterPrompt: 'Hello! Come in and take a seat. What seems to be the problem today?',
    suggestedVocabulary: ['symptom', 'prescription', 'headache', 'fever', 'allergic'],
  },
  {
    id: 'casual_party',
    title: 'Meeting New Friends at a Gathering',
    description: 'Strike up a conversation, talk about hobbies, movies, and city life.',
    category: 'social',
    targetRole: 'Party Guest',
    userRole: 'Newcomer',
    starterPrompt: 'Hey! I do not think we have met yet. I am Alex. How do you know the host?',
    suggestedVocabulary: ['hobby', 'recommendation', 'series', 'originally', 'neighborhood'],
  },
];

export class AriaChatEngine {
  private messages: ChatMessage[] = [];
  private provider: AIProvider | null = null;
  private config: AriaChatConfig;

  constructor(
    provider: AIProvider | null,
    config: Partial<AriaChatConfig> = {}
  ) {
    this.provider = provider;
    this.config = {
      targetLanguage: config.targetLanguage || 'English',
      nativeLanguage: config.nativeLanguage || 'Arabic',
      userLevel: config.userLevel || 'B1',
      learningWords: config.learningWords || [],
      currentScenario: config.currentScenario || PRESET_SCENARIOS[0],
      correctMistakes: config.correctMistakes ?? true,
    };

    this.initScenario();
  }

  /**
   * Set or update active AI provider.
   */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /**
   * Update configuration and optionally restart scenario.
   */
  updateConfig(updates: Partial<AriaChatConfig>): void {
    const scenarioChanged = updates.currentScenario && updates.currentScenario.id !== this.config.currentScenario?.id;
    this.config = { ...this.config, ...updates };
    if (scenarioChanged) {
      this.initScenario();
    }
  }

  /**
   * Reset conversation with initial scenario starter.
   */
  initScenario(): void {
    this.messages = [];
    const scenario = this.config.currentScenario;
    if (!scenario) return;

    this.messages.push({
      id: `msg_starter_${Date.now()}`,
      role: 'assistant',
      content: scenario.starterPrompt,
      timestamp: Date.now(),
      highlightedWords: this.findMatchedLearningWords(scenario.starterPrompt),
    });
  }

  /**
   * Build the system prompt enforcing CEFR level, scenario persona,
   * natural weaving of target learning words, and polite corrections.
   */
  buildSystemPrompt(): string {
    const sc = this.config.currentScenario;
    const learningList = this.config.learningWords.slice(0, 10).join(', ');

    return [
      `You are Aria, an empathetic, encouraging language tutor and roleplay partner.`,
      `Target Language: ${this.config.targetLanguage}.`,
      `User CEFR Level: ${this.config.userLevel}. Adapt your sentence structure and vocabulary to this level.`,
      `User Native Language: ${this.config.nativeLanguage}. (Provide translations/explanations in this language ONLY when providing corrections or asked).`,
      sc ? `Current Roleplay Scenario: "${sc.title}".` : '',
      sc ? `Your Persona: ${sc.targetRole}. User Persona: ${sc.userRole}.` : '',
      learningList ? `User is actively practicing these words: [${learningList}]. Try to use 1 or 2 of these words naturally when appropriate, or prompt the user in a way that gives them an opportunity to use them.` : '',
      this.config.correctMistakes
        ? `If the user makes a clear grammatical or vocabulary mistake, include a short, gentle tip at the end formatted as: \n[Tip: explanation of mistake & corrected form in ${this.config.nativeLanguage}]`
        : `Do not interrupt the conversation with corrections.`,
      `Keep responses engaging, concise (under 80 words), and end with an open question to keep the dialogue flowing.`,
    ].filter(Boolean).join('\n');
  }

  /**
   * Send a user message and get Aria's response.
   */
  async sendMessage(userText: string): Promise<ChatMessage> {
    if (!userText.trim()) {
      throw new Error('Message cannot be empty');
    }

    // Record user message
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: userText.trim(),
      timestamp: Date.now(),
      highlightedWords: this.findMatchedLearningWords(userText),
    };
    this.messages.push(userMsg);

    // If no provider is available, provide simulated conversational fallback
    if (!this.provider) {
      const fallbackReply = this.generateFallbackResponse(userText);
      const assistantMsg: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: fallbackReply,
        timestamp: Date.now(),
        highlightedWords: this.findMatchedLearningWords(fallbackReply),
      };
      this.messages.push(assistantMsg);
      return assistantMsg;
    }

    // Construct prompt with history
    const systemPrompt = this.buildSystemPrompt();
    const historyTranscript = this.messages
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'User' : 'Aria'}: ${m.content}`)
      .join('\n');

    const prompt = `${systemPrompt}\n\nConversation so far:\n${historyTranscript}\nAria:`;

    const rawResponse = await this.provider.query(prompt);
    const cleanedResponse = rawResponse.trim();

    const assistantMsg: ChatMessage = {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content: cleanedResponse,
      timestamp: Date.now(),
      highlightedWords: this.findMatchedLearningWords(cleanedResponse),
    };
    this.messages.push(assistantMsg);
    return assistantMsg;
  }

  /**
   * Find which user learning words are present in a message text.
   */
  private findMatchedLearningWords(text: string): string[] {
    if (!this.config.learningWords.length) return [];
    const lower = text.toLowerCase();
    return this.config.learningWords.filter(word => {
      const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
      return regex.test(lower);
    });
  }

  /**
   * Deterministic fallback when AI provider is offline.
   */
  private generateFallbackResponse(userText: string): string {
    const sc = this.config.currentScenario;
    if (sc?.id === 'coffee_shop') {
      return `Certainly! That will be ready in just a few minutes. Would you like a receipt with that, or anything else today?`;
    }
    if (sc?.id === 'job_interview') {
      return `That is very interesting experience. Could you give an example of a difficult challenge you encountered and how you solved it?`;
    }
    return `That sounds great! Tell me more about that, or what do you think we should do next?`;
  }

  /**
   * Get all conversation messages.
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear history and restart current scenario.
   */
  reset(): void {
    this.initScenario();
  }
}
