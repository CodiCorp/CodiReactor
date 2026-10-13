// ─────────────────────────────────────────────────
// Service Worker: Manifest V3 Background Controller
// Handles inter-tab IPC routing, context menus,
// offline/online dictionary proxy, and AI queries
// ─────────────────────────────────────────────────

import { MessageBus, CRMessage } from '../core/ipc/messageBus';
import { DictionaryService } from '../services/dictionaryService';
import { LexaAI, OllamaProvider, GeminiProvider, OpenAIProvider } from '../ai/lexaAI';

export class ServiceWorkerController {
  private bus: MessageBus;
  private dictService: DictionaryService;
  private lexaAI: LexaAI;

  constructor() {
    this.bus = new MessageBus('background');
    this.dictService = new DictionaryService();
    this.lexaAI = new LexaAI();

    // Register default AI providers
    this.lexaAI.registerProvider(new OllamaProvider());
    this.lexaAI.registerProvider(new GeminiProvider(''));
    this.lexaAI.registerProvider(new OpenAIProvider(''));

    this.registerHandlers();
    this.setupContextMenus();
  }

  /**
   * Register IPC message bus handlers.
   */
  private registerHandlers(): void {
    // Ping/Pong
    this.bus.on('PING', (msg) => {
      this.bus.send({
        type: 'PONG',
        payload: { timestamp: Date.now() },
        requestId: msg.requestId,
      });
    });

    // Dictionary Lookup Proxy
    this.bus.on('DICTIONARY_LOOKUP', async (msg) => {
      const { word, language = 'en' } = msg.payload || {};
      if (!word) return;

      try {
        const result = await this.dictService.lookup(word, language);
        this.bus.send({
          type: 'DICTIONARY_RESULT',
          payload: { word, result },
          requestId: msg.requestId,
          tabId: msg.tabId,
        });
      } catch (err: any) {
        this.bus.send({
          type: 'DICTIONARY_RESULT',
          payload: { word, error: err.message },
          requestId: msg.requestId,
          tabId: msg.tabId,
        });
      }
    });

    // AI Query Proxy
    this.bus.on('AI_QUERY', async (msg) => {
      const { action, word, context, userLang } = msg.payload || {};
      try {
        let answer = '';
        if (action === 'examples') {
          answer = await this.lexaAI.getExamples(word, context, userLang);
        } else if (action === 'grammar') {
          answer = await this.lexaAI.explainGrammar(word, context, userLang);
        } else {
          answer = await this.lexaAI.explainWord(word, context, userLang);
        }

        this.bus.send({
          type: 'AI_RESULT',
          payload: { action, word, answer },
          requestId: msg.requestId,
          tabId: msg.tabId,
        });
      } catch (err: any) {
        this.bus.send({
          type: 'AI_RESULT',
          payload: { action, word, error: err.message },
          requestId: msg.requestId,
          tabId: msg.tabId,
        });
      }
    });

    // Translation Proxy
    this.bus.on('TRANSLATE_SENTENCE', async (msg) => {
      const { text, targetLang = 'en', sourceLang = 'auto' } = msg.payload || {};
      try {
        // Simple translation proxy
        const translated = text; // Fallback or external API integration
        this.bus.send({
          type: 'TRANSLATION_RESULT',
          payload: { original: text, translated, targetLang, sourceLang },
          requestId: msg.requestId,
          tabId: msg.tabId,
        });
      } catch (err: any) {
        this.bus.send({
          type: 'TRANSLATION_RESULT',
          payload: { original: text, error: err.message },
          requestId: msg.requestId,
          tabId: msg.tabId,
        });
      }
    });

    // Broadcast status changes to other tabs
    this.bus.on('WORD_STATUS_CHANGED', (msg) => {
      this.bus.broadcast(msg);
    });

    // Broadcast settings changes to other tabs
    this.bus.on('SETTINGS_CHANGED', (msg) => {
      this.bus.broadcast(msg);
    });
  }

  /**
   * Set up Chrome Context Menus for text selection and web reader.
   */
  private setupContextMenus(): void {
    if (typeof chrome === 'undefined' || !chrome.contextMenus) return;

    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: 'codireactor_lookup',
          title: 'Look up "%s" in CodiReactor',
          contexts: ['selection'],
        });

        chrome.contextMenus.create({
          id: 'codireactor_reader',
          title: 'Read Article in CodiReactor Immersion Mode',
          contexts: ['page'],
        });
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (!tab?.id) return;

      if (info.menuItemId === 'codireactor_lookup' && info.selectionText) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'DICTIONARY_LOOKUP',
          payload: { word: info.selectionText },
        });
      } else if (info.menuItemId === 'codireactor_reader') {
        chrome.tabs.sendMessage(tab.id, {
          type: 'ACTIVATE_WEB_READER',
          payload: {},
        });
      }
    });
  }
}

// Instantiate in service worker environment
if (typeof chrome !== 'undefined' && chrome.runtime) {
  new ServiceWorkerController();
}
