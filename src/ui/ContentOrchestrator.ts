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
import { consolidateAndSegmentCues, cleanSubtitleText } from '../core/parser/sentenceSegmenter';
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
      onMarkKnown: (lemma) => this.handleMarkKnown(lemma),
      onMarkLearning: (lemma) => this.handleMarkLearning(lemma),
      getWordStatus: (lemma) => this.getWordStatus(lemma),
      onSeekPrev: () => this.seekToPrevCue(),
      onSeekNext: () => this.seekToNextCue(),
      onReplayCurrent: () => this.replayCurrentCue(),
      onSaveCurrent: () => this.saveCurrentSubtitle(),
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
        onToggleVisibility: (visible: boolean) => {
          const sidebarEl = this.sidebar?.getElement();
          const pillEl = this.sidebar?.getCollapsedPill();
          if (sidebarEl && (this.adapter as any).repositionSidebar) {
            (this.adapter as any).repositionSidebar(sidebarEl, pillEl || undefined);
          }
        },
      });
      this.sidebar.mount();
      const sidebarEl = this.sidebar.getElement();
      const pillEl = this.sidebar.getCollapsedPill();
      if (sidebarEl && (this.adapter as any).repositionSidebar) {
        (this.adapter as any).repositionSidebar(sidebarEl, pillEl || undefined);
      }
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
      this.allCues = tracks[0].cues
        .map(c => ({
          ...c,
          text: cleanSubtitleText(c.text),
        }))
        .filter(c => c.text.length > 0);
      this.language = tracks[0].language;
      this.sidebar?.setCues(this.allCues);

      // Pre-translate first 5 cues in background for 0ms initial playback latency
      for (let i = 0; i < Math.min(5, this.allCues.length); i++) {
        const cue = this.allCues[i];
        if (!cue.translatedText) {
          getSentenceTranslation(cue.text, this.nativeLanguage).then(t => {
            if (t) cue.translatedText = t;
          });
        }
      }
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

    // LOCK: Once we have authoritative official YouTube subtitles (from playerResponse/TextTrack/fetch),
    // completely ignore ALL subsequent caption updates from DOM observer or other synthetic sources.
    // This is the definitive fix for the "not connected to real YouTube subtitle" sync issue.
    if (this.hasAuthoritativeTrack) {
      return;
    }

    // If we receive a large batch (>5 cues), this is an authoritative official track extraction.
    // Preserve YouTube's exact timedtext cue boundaries for 100% sync!
    if (cues.length > 5) {
      this.hasAuthoritativeTrack = true;
      this.allCues = cues
        .map(c => ({
          ...c,
          text: cleanSubtitleText(c.text),
        }))
        .filter(c => c.text.length > 0);
      this.sidebar?.setCues(this.allCues);

      const video = this.adapter?.getVideoElement();
      const currentTimeMs = video ? Math.round(video.currentTime * 1000) : 0;
      this.handleTimeUpdate(currentTimeMs);
      return;
    }

    // For small incremental cues (DOM observer fallback when no official track exists):
    // Deduplicate against existing cues before adding
    const newCues: SubtitleCue[] = [];
    for (const cue of cues) {
      const normNew = cue.text.toLowerCase().replace(/[^a-z0-9]/gi, '');
      if (normNew.length < 3) continue;

      const isDuplicate = this.allCues.some(existing => {
        const normExisting = existing.text.toLowerCase().replace(/[^a-z0-9]/gi, '');
        return normExisting === normNew && Math.abs(existing.startMs - cue.startMs) < 90000;
      });

      if (!isDuplicate) {
        newCues.push(cue);
      }
    }

    if (newCues.length === 0) return;

    // Only consolidate the new cues together with existing, not the full list each time
    this.allCues = consolidateAndSegmentCues([...this.allCues, ...newCues]);

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

    // Attach word-level timestamps (LR Se() parity with linear interpolation fallback)
    const wordTokens = enriched.filter(t => !t.isPunctuation && !t.isWhitespace);
    if (cue.wordTimings && cue.wordTimings.length > 0) {
      let wtIdx = 0;
      for (let i = 0; i < wordTokens.length; i++) {
        const token = wordTokens[i];
        const tokenNorm = token.cleanText.toLowerCase().replace(/[^a-z0-9]/gi, '');
        let matched = false;
        for (let j = wtIdx; j < cue.wordTimings.length; j++) {
          const wt = cue.wordTimings[j];
          const wtNorm = wt.word.toLowerCase().replace(/[^a-z0-9]/gi, '');
          if (wtNorm === tokenNorm || wtNorm.includes(tokenNorm) || tokenNorm.includes(wtNorm)) {
            token.startMs = wt.startMs;
            token.endMs = wt.endMs;
            wtIdx = j + 1;
            matched = true;
            break;
          }
        }
        if (!matched && wtIdx < cue.wordTimings.length) {
          token.startMs = cue.wordTimings[wtIdx].startMs;
          token.endMs = cue.wordTimings[wtIdx].endMs;
          wtIdx++;
        }
      }
    }

    // Fallback: If any word token lacks timing, interpolate evenly across cue duration
    if (wordTokens.length > 0) {
      const cueDuration = Math.max(1, cue.endMs - cue.startMs);
      const step = cueDuration / wordTokens.length;
      for (let i = 0; i < wordTokens.length; i++) {
        if (wordTokens[i].startMs === undefined || wordTokens[i].endMs === undefined) {
          wordTokens[i].startMs = Math.round(cue.startMs + i * step);
          wordTokens[i].endMs = Math.round(cue.startMs + (i + 1) * step);
        }
      }
    }

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
          if (this.currentCueIndex !== -1 && this.allCues[this.currentCueIndex]?.id === cue.id) {
            this.overlay.renderTranslation(trans, this.nativeLanguage);
          }
        }
      });
    }

    // Pre-translate upcoming 2 cues for instant 0ms latency playback
    const currentIdx = this.currentCueIndex;
    if (currentIdx !== -1) {
      for (let i = currentIdx + 1; i <= currentIdx + 2 && i < this.allCues.length; i++) {
        const nextCue = this.allCues[i];
        if (nextCue && !nextCue.translatedText) {
          getSentenceTranslation(nextCue.text, this.nativeLanguage).then(t => {
            if (t) nextCue.translatedText = t;
          });
        }
      }
    }

    // Update coverage
    const wordTokensForCoverage = enriched.filter(t => !t.isPunctuation && !t.isWhitespace);
    const lemmas = wordTokensForCoverage.map(t => t.lemma);
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

    // Language Reactor 125ms audio lead offset (S = 125ms)
    const effectiveTime = timeMs + 125;

    // Find the active cue for this timestamp
    let cueIndex = this.allCues.findIndex(
      c => effectiveTime >= c.startMs && timeMs <= c.endMs,
    );

    // If between cues, check if we are within 125ms before upcoming cue for seamless sync
    if (cueIndex === -1) {
      const upcomingIndex = this.allCues.findIndex(
        c => timeMs < c.startMs && (c.startMs - timeMs) <= 125,
      );
      if (upcomingIndex !== -1) {
        cueIndex = upcomingIndex;
      }
    }

    if (cueIndex !== -1 && cueIndex !== this.currentCueIndex) {
      this.currentCueIndex = cueIndex;
      this.processCue(this.allCues[cueIndex]);
    } else if (cueIndex === -1) {
      // Between cues — clear display after 400ms pause
      const lastActive = this.currentCueIndex;
      if (lastActive !== -1) {
        const lastCue = this.allCues[lastActive];
        if (lastCue && timeMs > lastCue.endMs + 400) {
          this.overlay.clearSubtitles();
          this.currentCueIndex = -1;
        }
      }
    }

    // 60FPS real-time spoken word karaoke highlight
    if (this.currentCueIndex !== -1) {
      this.overlay.updateActiveSpokenWord(effectiveTime);
    }
  }

  // ─── Word Interactions ─────────────────────────

  private async handleWordClick(word: string, lemma: string, element: HTMLElement): Promise<void> {
    // Automatically pause video when any word is clicked
    const video = this.adapter?.getVideoElement();
    if (video && !video.paused) {
      video.pause();
    }

    // Subtitle overlay words display the compact blue dictionary balloon
    // directly (matching image copy 5 & 6), which is already handled and pinned by OverlayManager.
    // Only open the full dictionary popup for sidebar elements or non-overlay words.
    if (element.classList?.contains('cr-word') || element.dataset?.lemma) {
      return;
    }

    // Always dismiss any existing popup first (prevents stale popups)
    this.overlay.hideDictPopup();

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
    this.handleMarkLearning(lemma);
  }

  private getWordStatus(lemma: string): 'known' | 'learning' | 'suggested' | 'ignored' {
    const clean = lemma.toLowerCase();
    if (this.vocab.knownWords.has(clean)) return 'known';
    if (this.vocab.learningWords.has(clean)) return 'learning';
    if (this.vocab.ignoredWords.has(clean)) return 'ignored';
    return 'suggested';
  }

  private handleMarkKnown(lemma: string): void {
    const clean = lemma.toLowerCase();
    this.vocab.knownWords.add(clean);
    this.vocab.learningWords.delete(clean);
    this.vocab.ignoredWords.delete(clean);
    this.sidebar?.setWordStatus(clean, 'known');
    this.refreshCurrentCue();
    this.messageBus.send({
      type: 'WORD_STATUS_CHANGED',
      payload: { lemma: clean, status: 'known' },
      source: 'content',
    });
  }

  private handleMarkLearning(lemma: string): void {
    const clean = lemma.toLowerCase();
    this.vocab.learningWords.add(clean);
    this.vocab.knownWords.delete(clean);
    this.vocab.ignoredWords.delete(clean);
    this.sidebar?.setWordStatus(clean, 'learning');

    const cue = this.currentCueIndex >= 0 ? this.allCues[this.currentCueIndex] : null;
    this.sidebar?.addSavedWord(clean, clean, cue?.text || '');
    this.messageBus.send({
      type: 'SAVE_PHRASE',
      payload: {
        word: clean,
        sentence: cue?.text || '',
        timestamp: cue?.startMs || 0,
        platform: this.adapter?.platformId || 'unknown',
      },
      source: 'content',
    });

    this.refreshCurrentCue();
    this.messageBus.send({
      type: 'WORD_STATUS_CHANGED',
      payload: { lemma: clean, status: 'learning' },
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
