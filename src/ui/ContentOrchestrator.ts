// ─────────────────────────────────────────────────
// Content Script Orchestrator: Wires together
// adapter + linguistics + overlay + IPC
// This is the main entry point for content scripts
// ─────────────────────────────────────────────────

import { detectPlatform } from '../adapters';
import { IVideoPlatformAdapter } from '../adapters/BasePlatformAdapter';
import { tokenize } from '../core/linguistics/tokenizer';
import { enrichTokens, toggleWordStatus, ignoreWord, createEmptyVocabulary, type VocabularyState } from '../core/linguistics/vocabularyMatrix';
import { loadFrequencyData, generateSeedFrequencyData, calculateCoverage } from '../core/linguistics/frequencyEngine';
import { getMessageBus, type MessageBus } from '../core/ipc/messageBus';
import { OverlayManager } from './OverlayManager';
import { buildDictionaryPopup } from './DictionaryPopup';
import { PlayerShortcutEngine } from './PlayerShortcuts';
import { buildHostPlayerControls } from './PlayerControls';
import { SettingsModal } from './SettingsModal';
import { SidebarPanel } from './SidebarPanel';
import { FirstRunModal } from './FirstRunModal';
import { lookupWord } from '../services/dictionaryService';
import { getSentenceTranslation } from '../services/quickTranslation';
import { consolidateAndSegmentCues } from '../core/parser/sentenceSegmenter';
import { SubtitleCue, EnrichedToken } from '../core/types';

/**
 * Main orchestrator that runs inside each content script.
 * Wires the adapter → linguistics → overlay pipeline.
 */
export class ContentOrchestrator {
  private adapter: IVideoPlatformAdapter | null = null;
  private overlay: OverlayManager;
  private sidebar: SidebarPanel | null = null;
  private shortcuts: PlayerShortcutEngine | null = null;
  private messageBus: MessageBus;
  private vocab: VocabularyState;
  private language = 'en';
  private nativeLanguage = 'ar';
  private allCues: SubtitleCue[] = [];
  private currentCueIndex = -1;
  private currentTokens: EnrichedToken[] = [];
  private autoPause = false;
  private isEnabled = true;
  private hasAuthoritativeTrack = false;
  private cleanupFns: Array<() => void> = [];

  constructor() {
    this.overlay = new OverlayManager();
    this.messageBus = getMessageBus('content');
    this.vocab = createEmptyVocabulary();

    // Load seed frequency data
    loadFrequencyData(generateSeedFrequencyData());
  }

  /**
   * Boot the orchestrator: detect platform, set up adapter, mount overlay.
   */
  async boot(): Promise<void> {
    // Detect platform
    this.adapter = detectPlatform();
    if (!this.adapter) {
      console.log('[CodiReactor] No supported platform detected');
      return;
    }

    console.log(`[CodiReactor] Platform detected: ${this.adapter.platformId}`);

    // Initialize adapter
    await this.adapter.initialize();

    // Mount overlay
    const mountPoint = this.adapter.getOverlayMountPoint();
    this.overlay.mount(mountPoint);

    // Wire callbacks
    this.overlay.setCallbacks({
      onWordClick: (word, lemma, el) => this.handleWordClick(word, lemma, el),
      onWordRightClick: (word, lemma) => this.handleWordRightClick(word, lemma),
      onSeekPrev: () => this.seekToPrevCue(),
      onSeekNext: () => this.seekToNextCue(),
      onReplayCurrent: () => this.replayCurrentCue(),
      onSaveCurrent: () => this.saveCurrentSubtitle(),
    });

    // Set up overlay controls
    this.overlay.addControls({
      onToggle: () => this.toggleEnabled(),
      onAutoPause: () => this.toggleAutoPause(),
      coveragePercent: 0,
    });

    // Set up native player bar controls (injected into YouTube/Netflix control bar)
    const hostControls = buildHostPlayerControls({
      onToggle: (enabled) => {
        if (enabled !== this.isEnabled) this.toggleEnabled();
      },
      onAutoPause: (enabled) => {
        if (enabled !== this.autoPause) this.toggleAutoPause();
      },
      initialLRState: this.isEnabled,
      initialAPState: this.autoPause,
      coveragePercent: 0,
    });
    this.adapter.injectControls(hostControls);

    // Setup native language & First-run modal (Screenshot 093213.png)
    const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('cr_native_lang') : null;
    if (savedLang) {
      this.nativeLanguage = savedLang;
    } else if (typeof document !== 'undefined') {
      new FirstRunModal({
        defaultLanguage: 'Arabic',
        onConfirm: (lang, autoHide) => {
          this.nativeLanguage = lang;
          try {
            localStorage.setItem('cr_native_lang', lang);
            localStorage.setItem('cr_autohide_bar', String(autoHide));
          } catch { /* ignore */ }
        },
      }).open();
    }

    // Mount interactive right-side transcript sidebar (Screenshots 093356, 093424, 093439, 093511)
    if (typeof document !== 'undefined') {
      this.sidebar = new SidebarPanel({
        onSeek: (timeMs) => {
          this.adapter?.seekTo(timeMs);
          const video = this.adapter?.getVideoElement();
          if (video && video.paused) video.play();
        },
        onWordClick: (word, lemma, el) => this.handleWordClick(word, lemma, el),
        onPauseVideo: () => {
          const video = this.adapter?.getVideoElement();
          if (video && !video.paused) video.pause();
        },
        onWordStatusChange: (lemma, status) => {
          if (status === 'known') {
            this.vocab.knownWords.add(lemma);
            this.vocab.learningWords.delete(lemma);
            this.vocab.ignoredWords.delete(lemma);
          } else if (status === 'learning') {
            this.vocab.learningWords.add(lemma);
            this.vocab.knownWords.delete(lemma);
            this.vocab.ignoredWords.delete(lemma);
          } else if (status === 'ignored') {
            this.vocab.ignoredWords.add(lemma);
            this.vocab.knownWords.delete(lemma);
            this.vocab.learningWords.delete(lemma);
          }
          this.refreshCurrentCue();
          this.messageBus.send({
            type: 'WORD_STATUS_CHANGED',
            payload: { lemma, status },
            source: 'content',
          });
        },
        onSavePhrase: (cue) => {
          this.messageBus.send({
            type: 'SAVE_PHRASE',
            payload: {
              sentence: cue.text,
              timestamp: cue.startMs,
              platform: this.adapter?.platformId || 'unknown',
            },
            source: 'content',
          });
        },
        onOpenSettings: () => new SettingsModal().open(),
      });
      this.sidebar.mount();
    }

    // Subscribe to captions
    const unsubCaptions = this.adapter.onCaptionUpdate((cues) => {
      this.handleCaptionUpdate(cues);
    });
    this.cleanupFns.push(unsubCaptions);

    // Subscribe to time updates
    const unsubTime = this.adapter.onTimeUpdate((timeMs) => {
      this.handleTimeUpdate(timeMs);
    });
    this.cleanupFns.push(unsubTime);

    // Try to extract initial captions (show loading toast)
    this.overlay.showLoadingToast();
    const tracks = await this.adapter.extractCaptions();
    if (tracks.length > 0 && tracks[0].cues.length > 0) {
      this.overlay.hideLoadingToast();
      this.hasAuthoritativeTrack = true;
      this.allCues = consolidateAndSegmentCues(tracks[0].cues);
      this.language = tracks[0].language;
      this.sidebar?.setCues(this.allCues);
    }

    // Set up keyboard shortcuts
    this.shortcuts = new PlayerShortcutEngine({
      seekToPrevCue: () => this.seekToPrevCue(),
      replayCurrentCue: () => this.replayCurrentCue(),
      seekToNextCue: () => this.seekToNextCue(),
      togglePlayPause: () => this.togglePlayPause(),
      toggleAutoPause: () => this.toggleAutoPause(),
      saveCurrentSubtitle: () => this.saveCurrentSubtitle(),
      revealMaskedText: () => {},
      decreasePlaybackRate: () => this.changePlaybackRate(-0.25),
      increasePlaybackRate: () => this.changePlaybackRate(0.25),
      toggleOverlay: () => this.toggleEnabled(),
      toggleTranscript: () => this.sidebar?.toggle(),
    });
    this.shortcuts.enable();

    // Set up IPC listeners
    this.setupIPCListeners();

    console.log('[CodiReactor] Orchestrator booted successfully');
  }

  /** Shut down the orchestrator */
  destroy(): void {
    for (const fn of this.cleanupFns) {
      try { fn(); } catch { /* ignore */ }
    }
    this.cleanupFns = [];
    this.sidebar?.destroy();
    this.adapter?.destroy();
    this.overlay.unmount();
    this.shortcuts?.destroy();
    this.messageBus.destroy();
  }

  // ─── Caption Pipeline ─────────────────────────

  private handleCaptionUpdate(cues: SubtitleCue[]): void {
    if (!this.isEnabled) return;
    this.overlay.hideLoadingToast();

    // If authoritative official YouTube subtitles are active, never let small synthetic DOM fragments pollute
    if (this.hasAuthoritativeTrack && cues.length <= 5) {
      return;
    }

    // Consolidate & segment rolling ASR stream into discrete, deduplicated sentences
    if (cues.length > 5) {
      this.hasAuthoritativeTrack = true;
      this.allCues = consolidateAndSegmentCues(cues);
    } else {
      this.allCues = consolidateAndSegmentCues([...this.allCues, ...cues]);
    }

    // Update sidebar transcript
    this.sidebar?.setCues(this.allCues);

    // Sync active cue with current video position
    const video = this.adapter?.getVideoElement();
    const currentTimeMs = video ? Math.round(video.currentTime * 1000) : 0;
    this.handleTimeUpdate(currentTimeMs);
  }

  private processCue(cue: SubtitleCue): void {
    // Tokenize
    const rawTokens = tokenize(cue.text, this.language);

    // Enrich with vocabulary status
    const enriched = enrichTokens(rawTokens, this.language, this.vocab);
    this.currentTokens = enriched;

    // Render target line with token colors
    this.overlay.renderTokens(enriched, this.language);

    // Render dual subtitle translation (Arabic by default)
    if (cue.translatedText) {
      this.overlay.renderTranslation(cue.translatedText, this.nativeLanguage);
    } else {
      getSentenceTranslation(cue.text, this.nativeLanguage).then((trans) => {
        if (trans) {
          cue.translatedText = trans;
          this.overlay.renderTranslation(trans, this.nativeLanguage);
        }
      });
    }

    // Update coverage
    const wordTokens = enriched.filter(t => !t.isPunctuation && !t.isWhitespace);
    const lemmas = wordTokens.map(t => t.lemma);
    const coverage = calculateCoverage(lemmas, 1000, this.vocab.knownWords);
    this.overlay.updateCoverage(coverage);

    // Auto-pause
    if (this.autoPause) {
      const video = this.adapter?.getVideoElement();
      if (video && !video.paused) {
        video.pause();
      }
    }

    // Send enriched tokens to background for storage
    this.messageBus.send({
      type: 'TOKENS_ENRICHED',
      payload: { cue, tokens: enriched },
      source: 'content',
    });
  }

  private handleTimeUpdate(timeMs: number): void {
    if (!this.isEnabled || this.allCues.length === 0) return;

    // Update active cue in sidebar
    this.sidebar?.setActiveTime(timeMs);

    // Find the active cue for this timestamp
    const cueIndex = this.allCues.findIndex(
      c => timeMs >= c.startMs && timeMs <= c.endMs,
    );

    if (cueIndex !== -1 && cueIndex !== this.currentCueIndex) {
      this.currentCueIndex = cueIndex;
      this.processCue(this.allCues[cueIndex]);
    } else if (cueIndex === -1) {
      // Between cues — clear display
      const lastActive = this.currentCueIndex;
      if (lastActive !== -1) {
        const lastCue = this.allCues[lastActive];
        if (lastCue && timeMs > lastCue.endMs + 500) {
          this.overlay.clearSubtitles();
          this.currentCueIndex = -1;
        }
      }
    }
  }

  // ─── Word Interactions ─────────────────────────

  private async handleWordClick(word: string, lemma: string, element: HTMLElement): Promise<void> {
    // Automatically pause video when any word is clicked
    const video = this.adapter?.getVideoElement();
    if (video && !video.paused) {
      video.pause();
    }

    // Look up the word in dictionary
    const result = await lookupWord(lemma, this.language);

    // Determine current status
    let status: 'known' | 'learning' | 'suggested' | 'ignored' | 'special' = 'suggested';
    if (this.vocab.knownWords.has(lemma)) status = 'known';
    if (this.vocab.learningWords.has(lemma)) status = 'learning';
    if (this.vocab.ignoredWords.has(lemma)) status = 'ignored';

    // Build popup
    const popupContent = buildDictionaryPopup({
      entry: result.entry,
      externalLinks: result.externalLinks,
      currentStatus: status,
      onClose: () => this.overlay.hideDictPopup(),
      onMarkKnown: () => {
        this.vocab.knownWords.add(lemma);
        this.vocab.learningWords.delete(lemma);
        this.vocab.ignoredWords.delete(lemma);
        this.refreshCurrentCue();
        this.overlay.hideDictPopup();
        this.messageBus.send({ type: 'WORD_STATUS_CHANGED', payload: { lemma, status: 'known' }, source: 'content' });
      },
      onMarkLearning: () => {
        this.vocab.learningWords.add(lemma);
        this.vocab.knownWords.delete(lemma);
        this.vocab.ignoredWords.delete(lemma);
        this.refreshCurrentCue();
        this.overlay.hideDictPopup();
        this.messageBus.send({ type: 'WORD_STATUS_CHANGED', payload: { lemma, status: 'learning' }, source: 'content' });
      },
      onMarkIgnored: () => {
        ignoreWord(lemma, this.vocab);
        this.refreshCurrentCue();
        this.overlay.hideDictPopup();
        this.messageBus.send({ type: 'WORD_STATUS_CHANGED', payload: { lemma, status: 'ignored' }, source: 'content' });
      },
      onSavePhrase: () => {
        const cue = this.currentCueIndex >= 0 ? this.allCues[this.currentCueIndex] : null;
        this.messageBus.send({
          type: 'SAVE_PHRASE',
          payload: {
            word: lemma,
            sentence: cue?.text || '',
            timestamp: cue?.startMs || 0,
            platform: this.adapter?.platformId || 'unknown',
          },
          source: 'content',
        });
      },
      onPlayAudio: () => {
        if (result.entry?.audioUrl) {
          new Audio(result.entry.audioUrl).play().catch(() => {});
        }
      },
    });

    this.overlay.showDictPopup(popupContent, element);
  }

  private handleWordRightClick(word: string, lemma: string): void {
    const newStatus = toggleWordStatus(lemma, this.vocab);
    this.refreshCurrentCue();
    this.messageBus.send({
      type: 'WORD_STATUS_CHANGED',
      payload: { lemma, status: newStatus },
      source: 'content',
    });
  }

  // ─── Player Controls ──────────────────────────

  private seekToPrevCue(): void {
    if (this.currentCueIndex > 0) {
      const prev = this.allCues[this.currentCueIndex - 1];
      this.adapter?.seekTo(prev.startMs);
    }
  }

  private seekToNextCue(): void {
    if (this.currentCueIndex < this.allCues.length - 1) {
      const next = this.allCues[this.currentCueIndex + 1];
      this.adapter?.seekTo(next.startMs);
    }
  }

  private replayCurrentCue(): void {
    if (this.currentCueIndex >= 0 && this.allCues[this.currentCueIndex]) {
      const current = this.allCues[this.currentCueIndex];
      this.adapter?.seekTo(current.startMs);
      const video = this.adapter?.getVideoElement();
      if (video && video.paused) video.play();
    }
  }

  private togglePlayPause(): void {
    const video = this.adapter?.getVideoElement();
    if (video) {
      video.paused ? video.play() : video.pause();
    }
  }

  private toggleAutoPause(): void {
    this.autoPause = !this.autoPause;
  }

  private toggleEnabled(): void {
    this.isEnabled = !this.isEnabled;
    this.overlay.setVisible(this.isEnabled);
  }

  private changePlaybackRate(delta: number): void {
    const video = this.adapter?.getVideoElement();
    if (video) {
      video.playbackRate = Math.max(0.25, Math.min(3, video.playbackRate + delta));
    }
  }

  private saveCurrentSubtitle(): void {
    const cue = this.currentCueIndex >= 0 ? this.allCues[this.currentCueIndex] : null;
    if (cue) {
      this.messageBus.send({
        type: 'SAVE_PHRASE',
        payload: {
          sentence: cue.text,
          timestamp: cue.startMs,
          platform: this.adapter?.platformId || 'unknown',
        },
        source: 'content',
      });
    }
  }

  // ─── Helpers ───────────────────────────────────

  private refreshCurrentCue(): void {
    if (this.currentCueIndex >= 0 && this.allCues[this.currentCueIndex]) {
      this.processCue(this.allCues[this.currentCueIndex]);
    }
  }

  private setupIPCListeners(): void {
    // Listen for settings changes
    const unsubSettings = this.messageBus.on('SETTINGS_CHANGED', (msg) => {
      // Re-process current cue with new settings
      this.refreshCurrentCue();
    });
    this.cleanupFns.push(unsubSettings);

    // Listen for dictionary results from background
    const unsubDict = this.messageBus.on('DICTIONARY_RESULT', (msg) => {
      // Could update the popup if it's still open
    });
    this.cleanupFns.push(unsubDict);

    // Listen for seek commands (from transcript panel)
    const unsubSeek = this.messageBus.on('SEEK_TO_TIME', (msg) => {
      if (msg.payload?.timeMs) {
        this.adapter?.seekTo(msg.payload.timeMs);
      }
    });
    this.cleanupFns.push(unsubSeek);

    // Direct Chrome Runtime message listener from Popup
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const onChromeMsg = (msg: any) => {
        if (msg.type === 'OPEN_SETTINGS_MODAL') {
          new SettingsModal().open();
        } else if (msg.type === 'TOGGLE_OVERLAY') {
          this.isEnabled = Boolean(msg.payload?.enabled);
          this.overlay.setVisible(this.isEnabled);
        } else if (msg.type === 'TOGGLE_AUTO_PAUSE') {
          this.autoPause = Boolean(msg.payload?.enabled);
        }
      };
      chrome.runtime.onMessage.addListener(onChromeMsg);
      this.cleanupFns.push(() => chrome.runtime.onMessage.removeListener(onChromeMsg));
    }
  }
}
