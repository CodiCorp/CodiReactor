// ─────────────────────────────────────────────────
// IPC MessageBus: Typed inter-context communication
// Routes messages between content scripts, service
// worker, popup, options page, and main-world scripts
// ─────────────────────────────────────────────────

/** All message types in the system */
export type MessageType =
  | 'SUBTITLE_CUES_EXTRACTED'
  | 'TOKENS_ENRICHED'
  | 'WORD_STATUS_CHANGED'
  | 'DICTIONARY_LOOKUP'
  | 'DICTIONARY_RESULT'
  | 'AI_QUERY'
  | 'AI_RESULT'
  | 'TRANSLATE_SENTENCE'
  | 'TRANSLATION_RESULT'
  | 'SETTINGS_CHANGED'
  | 'VIDEO_TIME_UPDATE'
  | 'SEEK_TO_TIME'
  | 'SAVE_PHRASE'
  | 'EXPORT_REQUEST'
  | 'PING'
  | 'PONG';

/** Typed message envelope */
export interface CRMessage<T extends MessageType = MessageType> {
  type: T;
  payload: any;
  tabId?: number;
  requestId?: string;
  source?: 'content' | 'background' | 'popup' | 'options' | 'mainWorld';
}

type MessageHandler = (message: CRMessage, sender?: any) => void | Promise<any>;

/**
 * MessageBus for extension IPC.
 * Handles routing between content scripts ↔ service worker ↔ popup ↔ options.
 */
export class MessageBus {
  private handlers: Map<MessageType, Set<MessageHandler>> = new Map();
  private isServiceWorker: boolean;

  constructor(context: 'content' | 'background' | 'popup' | 'options' = 'content') {
    this.isServiceWorker = context === 'background';
    this.setupListener();
  }

  /** Register a handler for a specific message type */
  on(type: MessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Send a message to the service worker (from content script / popup) */
  async send(message: Omit<CRMessage, 'requestId'>): Promise<any> {
    const msg: CRMessage = {
      ...message,
      requestId: crypto.randomUUID(),
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return chrome.runtime.sendMessage(msg);
    }

    // Fallback for non-extension contexts (testing)
    return this.handleLocally(msg);
  }

  /** Send a message to a specific tab (from service worker) */
  async sendToTab(tabId: number, message: Omit<CRMessage, 'tabId'>): Promise<any> {
    const msg: CRMessage = {
      ...message,
      tabId,
      requestId: crypto.randomUUID(),
    };

    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      return chrome.tabs.sendMessage(tabId, msg);
    }

    return this.handleLocally(msg);
  }

  /** Broadcast a message to ALL tabs (from service worker) */
  async broadcast(message: Omit<CRMessage, 'tabId'>): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              ...message,
              requestId: crypto.randomUUID(),
            });
          } catch {
            // Tab may not have content script
          }
        }
      }
    }
  }

  /** Handle messages from main-world scripts via window.postMessage */
  setupMainWorldListener(nonce: string): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.nonce !== nonce) return;
        if (event.data?.type && this.handlers.has(event.data.type)) {
          this.handleLocally(event.data as CRMessage);
        }
      });
    }
  }

  /** Internal message routing */
  private handleLocally(message: CRMessage): any {
    const handlers = this.handlers.get(message.type);
    if (!handlers || handlers.size === 0) return undefined;

    let result: any;
    for (const handler of handlers) {
      result = handler(message);
    }
    return result;
  }

  /** Set up chrome.runtime.onMessage listener */
  private setupListener(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(
        (message: CRMessage, sender: any, sendResponse: (response?: any) => void) => {
          const handlers = this.handlers.get(message.type);
          if (!handlers || handlers.size === 0) return false;

          // Handle async responses
          let isAsync = false;
          for (const handler of handlers) {
            const result = handler(message, sender);
            if (result instanceof Promise) {
              isAsync = true;
              result.then(sendResponse).catch(err => {
                console.error(`[MessageBus] Handler error for ${message.type}:`, err);
                sendResponse({ error: err.message });
              });
            }
          }

          return isAsync; // Return true to keep sendResponse channel open for async
        },
      );
    }
  }

  /** Remove all handlers */
  destroy(): void {
    this.handlers.clear();
  }
}

/** Singleton message bus factory */
let busInstance: MessageBus | null = null;

export function getMessageBus(context: 'content' | 'background' | 'popup' | 'options' = 'content'): MessageBus {
  if (!busInstance) {
    busInstance = new MessageBus(context);
  }
  return busInstance;
}

export function resetMessageBus(): void {
  if (busInstance) {
    busInstance.destroy();
    busInstance = null;
  }
}
