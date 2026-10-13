// ─────────────────────────────────────────────────
// Shadow DOM Overlay: Manages the root overlay
// container, subtitle rendering, and UI lifecycle
// ─────────────────────────────────────────────────

import { EnrichedToken, SubtitleCue, TOKEN_COLORS, TokenStatus } from '../core/types';
import { getTokenColor, shouldOutline, type VocabularyState } from '../core/linguistics/vocabularyMatrix';
import { getQuickWordTranslation, getCollocation } from '../services/quickTranslation';
import overlayCSS from './overlay.css?inline';

/**
 * Creates and manages the Shadow DOM overlay root.
 * This is the main entry point for all UI rendering.
 */
export class OverlayManager {
  private shadowRoot: ShadowRoot | null = null;
  private hostElement: HTMLElement | null = null;
  private subtitleBox: HTMLElement | null = null;
  private targetLine: HTMLElement | null = null;
  private translationLine: HTMLElement | null = null;
  private dictPopup: HTMLElement | null = null;
  private controlsBar: HTMLElement | null = null;
  private hoverBalloon: HTMLElement | null = null;
  private loadingToast: HTMLElement | null = null;
  private isVisible = true;
  private isBalloonPinned = false;
  private balloonHideTimer: any = null;
  private activeWordSpan: HTMLElement | null = null;
  private wordSpans: Array<{ span: HTMLElement; startMs: number; endMs: number }> = [];
  private currentBalloonRequestId = 0;

  /** Access shadow root (e.g. for testing and inspection) */
  getShadowRoot(): ShadowRoot | null {
    return this.shadowRoot;
  }

  /** Access host element */
  getHostElement(): HTMLElement | null {
    return this.hostElement;
  }

  // Callbacks
  private onWordClick: ((word: string, lemma: string, element: HTMLElement) => void) | null = null;
  private onWordRightClick: ((word: string, lemma: string) => void) | null = null;
  private onMarkKnown: ((lemma: string) => void) | null = null;
  private onMarkLearning: ((lemma: string) => void) | null = null;
  private getWordStatus: ((lemma: string) => TokenStatus) | null = null;
  private onSeekPrev: (() => void) | null = null;
  private onSeekNext: (() => void) | null = null;
  private onReplayCurrent: (() => void) | null = null;
  private onSaveCurrent: (() => void) | null = null;

  /**
   * Mount the overlay into a parent element using closed Shadow DOM.
   */
  mount(parent: HTMLElement): void {
    if (this.hostElement) this.unmount();

    // Create host element
    this.hostElement = document.createElement('div');
    this.hostElement.id = 'codireactor-root';
    this.hostElement.setAttribute('role', 'application');
    this.hostElement.setAttribute('aria-label', 'CodiReactor Language Learning Overlay');

    // Create closed Shadow DOM
    this.shadowRoot = this.hostElement.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = overlayCSS;
    this.shadowRoot.appendChild(style);

    // Build DOM structure
    const container = document.createElement('div');
    container.className = 'cr-overlay-container';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-live', 'polite');

    // Subtitle box (Matches reference ref/image.png)
    this.subtitleBox = document.createElement('div');
    this.subtitleBox.className = 'cr-subtitle-box';
    this.subtitleBox.setAttribute('role', 'status');
    this.subtitleBox.setAttribute('aria-label', 'Subtitles');

    // 1. Target language sentence line
    this.targetLine = document.createElement('div');
    this.targetLine.className = 'cr-subtitle-target';
    this.targetLine.setAttribute('lang', 'en');
    this.targetLine.setAttribute('dir', 'ltr');

    // 2. Dual subtitle translation line
    this.translationLine = document.createElement('div');
    this.translationLine.className = 'cr-subtitle-translation';
    this.translationLine.style.display = 'none';

    this.subtitleBox.appendChild(this.targetLine);
    this.subtitleBox.appendChild(this.translationLine);

    // Navigation arrows
    const prevArrow = this.createNavArrow('‹', 'cr-nav-prev', () => this.onSeekPrev?.());
    const nextArrow = this.createNavArrow('›', 'cr-nav-next', () => this.onSeekNext?.());

    // Dictionary popup (hidden)
    this.dictPopup = document.createElement('div');
    this.dictPopup.className = 'cr-dict-popup';
    this.dictPopup.setAttribute('role', 'dialog');
    this.dictPopup.setAttribute('aria-label', 'Word definition');
    this.dictPopup.hidden = true;

    // Player controls
    this.controlsBar = document.createElement('div');
    this.controlsBar.className = 'cr-player-controls';
    this.controlsBar.setAttribute('role', 'toolbar');
    this.controlsBar.setAttribute('aria-label', 'CodiReactor controls');

    // Assemble
    container.appendChild(prevArrow);
    container.appendChild(nextArrow);
    container.appendChild(this.subtitleBox);
    container.appendChild(this.dictPopup);
    container.appendChild(this.controlsBar);

    this.shadowRoot.appendChild(container);
    parent.appendChild(this.hostElement);

    // Close popup on click outside
    container.addEventListener('click', (e) => {
      if (this.dictPopup && !this.dictPopup.contains(e.target as Node) &&
          !(e.target as HTMLElement).classList?.contains('cr-word')) {
        this.hideDictPopup();
      }
      if (this.hoverBalloon && !this.hoverBalloon.contains(e.target as Node)) {
        this.hideWordBalloon(true);
      }
    });

    // Close pinned balloon when clicking outside host element
    document.addEventListener('click', (e) => {
      if (this.isBalloonPinned && this.hoverBalloon) {
        const path = e.composedPath();
        if (this.hostElement && !path.includes(this.hostElement)) {
          this.hideWordBalloon(true);
        }
      }
    });

    // Close popup on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideDictPopup();
        this.hideWordBalloon(true);
      }
    });
  }

  /**
   * Render enriched tokens into the subtitle overlay.
   */
  renderTokens(tokens: EnrichedToken[], language: string = 'en'): void {
    if (!this.targetLine) return;

    // Clear existing content and wordSpans
    this.targetLine.replaceChildren();
    this.targetLine.setAttribute('lang', language);
    this.wordSpans = [];

    // Set text direction
    const isRTL = ['ar', 'he', 'fa', 'ur'].includes(language);
    this.targetLine.setAttribute('dir', isRTL ? 'rtl' : 'ltr');

    for (const token of tokens) {
      if (token.isWhitespace) {
        this.targetLine.appendChild(document.createTextNode(' '));
        continue;
      }

      if (token.isPunctuation) {
        const punctSpan = document.createElement('span');
        punctSpan.textContent = token.text;
        punctSpan.className = 'cr-punctuation';
        this.targetLine.appendChild(punctSpan);
        continue;
      }

      const span = document.createElement('span');
      span.textContent = token.text;
      const statusClass = `cr-${token.status}`;
      span.className = `cr-word ${statusClass}`;

      if (token.outline) {
        span.classList.add('cr-outline');
      }

      span.setAttribute('tabindex', '0');
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', `${token.text} - ${token.status} word`);
      span.dataset.word = token.cleanText;
      span.dataset.lemma = token.lemma;

      if (token.startMs !== undefined && token.endMs !== undefined) {
        span.dataset.startMs = String(token.startMs);
        span.dataset.endMs = String(token.endMs);
        this.wordSpans.push({
          span,
          startMs: token.startMs,
          endMs: token.endMs,
        });
      }

      if (this.isBalloonPinned && this.activeWordSpan && this.activeWordSpan.dataset.lemma === token.lemma) {
        span.classList.add('cr-active-word');
        this.activeWordSpan = span;
      }

      // Left-click: open blue dictionary window & pin it
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showWordBalloon(token.cleanText, token.lemma, span, true);
        this.onWordClick?.(token.cleanText, token.lemma, span);
      });

      // Hover: show blue dictionary balloon
      span.addEventListener('mouseenter', () => {
        this.showWordBalloon(token.cleanText, token.lemma, span, false);
      });
      span.addEventListener('mouseleave', () => {
        this.scheduleHideBalloon();
      });

      // Right-click: mark word as learn (practice) & save to saved words
      span.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onWordRightClick?.(token.cleanText, token.lemma);
        span.className = 'cr-word cr-learning cr-outline';
        this.showWordBalloon(token.cleanText, token.lemma, span, true);
      });

      // Keyboard enter: open dictionary & pin
      span.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showWordBalloon(token.cleanText, token.lemma, span, true);
          this.onWordClick?.(token.cleanText, token.lemma, span);
        }
      });
      this.targetLine.appendChild(span);
    }

    // Show the subtitle box
    this.subtitleBox?.classList.remove('cr-hidden');
  }

  /**
   * Update active spoken word highlight (karaoke style)
   * Highlighting the active word at 60fps while keeping all words visible.
   */
  updateActiveSpokenWord(timeMs: number): void {
    if (this.wordSpans.length === 0) return;
    for (const item of this.wordSpans) {
      const isSpeaking = timeMs >= item.startMs && timeMs < item.endMs;
      if (isSpeaking) {
        if (!item.span.classList.contains('cr-speaking-word')) {
          item.span.classList.add('cr-speaking-word');
        }
      } else {
        if (item.span.classList.contains('cr-speaking-word')) {
          item.span.classList.remove('cr-speaking-word');
        }
      }
    }
  }

  /**
   * Render a translation line below the subtitle.
   */
  renderTranslation(text: string, language: string = 'en'): void {
    if (!this.translationLine) return;

    if (!text) {
      this.translationLine.style.display = 'none';
      return;
    }

    const isRTL = ['ar', 'he', 'fa', 'ur'].includes(language);
    this.translationLine.setAttribute('lang', language);
    this.translationLine.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    this.translationLine.textContent = text;
    this.translationLine.style.display = '';
  }

  /**
   * Show the mini-dictionary popup near a word element.
   */
  showDictPopup(content: HTMLElement, anchorElement: HTMLElement): void {
    if (!this.dictPopup || !this.shadowRoot) return;

    this.hideWordBalloon();
    this.dictPopup.replaceChildren(content);
    this.dictPopup.hidden = false;

    // Position calculation (collision-safe)
    requestAnimationFrame(() => {
      if (!this.dictPopup) return;

      const anchorRect = anchorElement.getBoundingClientRect();
      const popupRect = this.dictPopup.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // Try above the word first
      let top = anchorRect.top - popupRect.height - 8;
      let left = anchorRect.left + (anchorRect.width / 2) - (popupRect.width / 2);

      // If clipped by top, place below
      if (top < 8) {
        top = anchorRect.bottom + 8;
      }

      // Horizontal clamping
      if (left < 8) left = 8;
      if (left + popupRect.width > viewportW - 8) {
        left = viewportW - popupRect.width - 8;
      }

      // If clipped by bottom, shift up
      if (top + popupRect.height > viewportH - 8) {
        top = viewportH - popupRect.height - 8;
      }

      this.dictPopup.style.position = 'fixed';
      this.dictPopup.style.top = `${top}px`;
      this.dictPopup.style.left = `${left}px`;
    });
  }

  hideDictPopup(): void {
    if (this.dictPopup) {
      this.dictPopup.hidden = true;
      this.dictPopup.replaceChildren();
    }
  }

  /**
   * Add player controls (toggle, auto-pause, coverage badge).
   */
  addControls(controls: {
    onToggle?: () => void;
    onAutoPause?: () => void;
    onTranscript?: () => void;
    coveragePercent?: number;
  }): void {
    if (!this.controlsBar) return;
    this.controlsBar.replaceChildren();

    // Master toggle
    const toggleBtn = this.createControlBtn('LR', 'Toggle CodiReactor', controls.onToggle);
    toggleBtn.classList.add('cr-active');
    this.controlsBar.appendChild(toggleBtn);

    // Auto-pause
    const apBtn = this.createControlBtn('AP', 'Auto-Pause', controls.onAutoPause);
    this.controlsBar.appendChild(apBtn);

    // Transcript toggle
    const txBtn = this.createControlBtn('📜', 'Transcript', controls.onTranscript);
    this.controlsBar.appendChild(txBtn);

    // Coverage badge
    if (controls.coveragePercent !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'cr-coverage-badge';
      badge.textContent = `${controls.coveragePercent}%`;
      badge.title = `You know ${controls.coveragePercent}% of words`;
      this.controlsBar.appendChild(badge);
    }
  }

  /** Update the coverage badge */
  updateCoverage(percent: number): void {
    if (!this.controlsBar) return;
    const badge = this.controlsBar.querySelector('.cr-coverage-badge');
    if (badge) {
      badge.textContent = `${percent}%`;
    }
  }

  /** Clear the subtitle display */
  clearSubtitles(): void {
    this.hideWordBalloon(true);
    if (this.targetLine) this.targetLine.replaceChildren();
    if (this.translationLine) {
      this.translationLine.textContent = '';
      this.translationLine.style.display = 'none';
    }
    this.subtitleBox?.classList.add('cr-hidden');
  }

  /** Publicly dismiss the blue dictionary balloon */
  hideBalloon(): void {
    this.hideWordBalloon(true);
  }

  /** Toggle overlay visibility */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (this.hostElement) {
      this.hostElement.style.display = visible ? '' : 'none';
    }
  }

  /** Set callback handlers */
  setCallbacks(callbacks: {
    onWordClick?: (word: string, lemma: string, element: HTMLElement) => void;
    onWordRightClick?: (word: string, lemma: string) => void;
    onMarkKnown?: (lemma: string) => void;
    onMarkLearning?: (lemma: string) => void;
    getWordStatus?: (lemma: string) => TokenStatus;
    onSeekPrev?: () => void;
    onSeekNext?: () => void;
    onReplayCurrent?: () => void;
    onSaveCurrent?: () => void;
  }): void {
    this.onWordClick = callbacks.onWordClick || null;
    this.onWordRightClick = callbacks.onWordRightClick || null;
    this.onMarkKnown = callbacks.onMarkKnown || null;
    this.onMarkLearning = callbacks.onMarkLearning || null;
    this.getWordStatus = callbacks.getWordStatus || null;
    this.onSeekPrev = callbacks.onSeekPrev || null;
    this.onSeekNext = callbacks.onSeekNext || null;
    this.onReplayCurrent = callbacks.onReplayCurrent || null;
    this.onSaveCurrent = callbacks.onSaveCurrent || null;
  }

  /** Show blue dictionary balloon / card (ref/image copy 5.png & image copy 6.png parity) */
  private async showWordBalloon(word: string, lemma: string, anchor: HTMLElement, isPinned: boolean = false): Promise<void> {
    if (!this.shadowRoot) return;

    if (this.balloonHideTimer) {
      clearTimeout(this.balloonHideTimer);
      this.balloonHideTimer = null;
    }

    if (this.isBalloonPinned && !isPinned) {
      return; // Pinned card remains active during mouse movement
    }

    // Immediately dismiss and destroy all existing balloons in Shadow DOM
    this.hideWordBalloon(true);

    // Monotonic request ID guards against out-of-order async resolutions
    const reqId = ++this.currentBalloonRequestId;
    this.isBalloonPinned = isPinned;

    if (this.activeWordSpan) {
      this.activeWordSpan.classList.remove('cr-active-word');
    }
    this.activeWordSpan = anchor;
    if (isPinned) {
      anchor.classList.add('cr-active-word');
    }

    const translations = await getQuickWordTranslation(word, 'ar');
    if (reqId !== this.currentBalloonRequestId || !this.shadowRoot) return;
    if (!translations || translations.length === 0) {
      anchor.classList.remove('cr-active-word');
      return;
    }

    // Ensure genuine Arabic translations
    const validTranslations = translations.filter((tr) => {
      const cleanTr = tr.trim();
      return cleanTr.length > 0 && cleanTr.toLowerCase() !== word.toLowerCase() && /[\u0600-\u06FF]/.test(cleanTr);
    });
    if (validTranslations.length === 0) {
      anchor.classList.remove('cr-active-word');
      return;
    }

    // Sweep all existing balloon elements in Shadow DOM before creating new one
    this.shadowRoot.querySelectorAll('.cr-hover-balloon').forEach(el => el.remove());

    this.hoverBalloon = document.createElement('div');
    this.hoverBalloon.className = 'cr-hover-balloon';

    // Allow user to hover and interact with buttons inside
    this.hoverBalloon.addEventListener('mouseenter', () => {
      if (this.balloonHideTimer) {
        clearTimeout(this.balloonHideTimer);
        this.balloonHideTimer = null;
      }
    });

    this.hoverBalloon.addEventListener('mouseleave', () => {
      if (!this.isBalloonPinned) {
        this.scheduleHideBalloon();
      }
    });

    // 1. Phrase / Collocation Badge & Translation (e.g. "welcome to" -> "مرحبا بك في" in image copy 5)
    const colloc = getCollocation(word) || getCollocation(lemma);
    if (colloc) {
      const phraseBadge = document.createElement('div');
      phraseBadge.className = 'cr-balloon-phrase-badge';
      phraseBadge.textContent = colloc.text;
      this.hoverBalloon.appendChild(phraseBadge);

      const phraseTrans = document.createElement('div');
      phraseTrans.className = 'cr-balloon-phrase-trans';
      phraseTrans.textContent = colloc.translation;
      this.hoverBalloon.appendChild(phraseTrans);
    }

    // 2. Word Badge & Arabic Definitions List (e.g. "welcome" -> "أهلاً وسهلاً", "ترحيب", "مرحباً")
    const wordBadge = document.createElement('div');
    wordBadge.className = 'cr-balloon-word-badge';
    wordBadge.textContent = word;
    this.hoverBalloon.appendChild(wordBadge);

    const transWrapper = document.createElement('div');
    transWrapper.className = 'cr-balloon-translations';
    transWrapper.setAttribute('dir', 'rtl');
    transWrapper.setAttribute('lang', 'ar');
    validTranslations.slice(0, 3).forEach((tr) => {
      const line = document.createElement('div');
      line.textContent = tr;
      transWrapper.appendChild(line);
    });
    this.hoverBalloon.appendChild(transWrapper);

    // 3. Action Buttons Pill ([ ✓ ] Known, [ 📖 ] Learn & Save)
    const actionsPill = document.createElement('div');
    actionsPill.className = 'cr-balloon-actions-pill';

    const currentStatus = this.getWordStatus ? this.getWordStatus(lemma) : 'suggested';

    // [ ✓ ] Mark as Known Button
    const knownBtn = document.createElement('button');
    knownBtn.className = `cr-balloon-btn cr-balloon-btn-known${currentStatus === 'known' ? ' is-active' : ''}`;
    knownBtn.textContent = '✓';
    knownBtn.title = 'Mark as Known (1)';
    knownBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onMarkKnown?.(lemma);
      knownBtn.classList.add('is-active');
      learnBtn.classList.remove('is-active');
      anchor.className = 'cr-word cr-known';
      anchor.classList.remove('cr-outline', 'cr-learning', 'cr-suggested');
    });
    actionsPill.appendChild(knownBtn);

    // [ 📖 ] Mark as Learn (Practice) Button
    const learnBtn = document.createElement('button');
    learnBtn.className = `cr-balloon-btn cr-balloon-btn-learn${currentStatus === 'learning' ? ' is-active' : ''}`;
    learnBtn.textContent = '📖';
    learnBtn.title = 'Mark as Learn & Practice (2)';
    learnBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onMarkLearning?.(lemma);
      learnBtn.classList.add('is-active');
      knownBtn.classList.remove('is-active');
      anchor.className = 'cr-word cr-learning cr-outline';
    });
    actionsPill.appendChild(learnBtn);

    this.hoverBalloon.appendChild(actionsPill);
    this.shadowRoot.appendChild(this.hoverBalloon);

    // Position calculation directly above anchor
    requestAnimationFrame(() => {
      if (!this.hoverBalloon) return;
      const rect = anchor.getBoundingClientRect();
      const balloonRect = this.hoverBalloon.getBoundingClientRect();

      let top = rect.top - balloonRect.height - 8;
      let left = rect.left + rect.width / 2 - balloonRect.width / 2;

      if (top < 8) top = rect.bottom + 8;
      if (left < 8) left = 8;
      if (left + balloonRect.width > window.innerWidth - 8) {
        left = window.innerWidth - balloonRect.width - 8;
      }

      this.hoverBalloon.style.top = `${top}px`;
      this.hoverBalloon.style.left = `${left}px`;
    });
  }

  private scheduleHideBalloon(): void {
    if (this.isBalloonPinned) return;
    if (this.balloonHideTimer) clearTimeout(this.balloonHideTimer);
    this.balloonHideTimer = setTimeout(() => {
      this.hideWordBalloon();
    }, 250);
  }

  private hideWordBalloon(force: boolean = false): void {
    if (this.isBalloonPinned && !force) return;
    this.currentBalloonRequestId++;
    if (this.balloonHideTimer) {
      clearTimeout(this.balloonHideTimer);
      this.balloonHideTimer = null;
    }
    if (this.activeWordSpan) {
      this.activeWordSpan.classList.remove('cr-active-word');
      this.activeWordSpan = null;
    }
    if (this.shadowRoot) {
      this.shadowRoot.querySelectorAll('.cr-hover-balloon').forEach(el => el.remove());
    }
    this.hoverBalloon = null;
    this.isBalloonPinned = false;
  }

  /** Show 'Loading subtitles... -' toast (Screenshot 093213) */
  showLoadingToast(text: string = 'Loading subtitles... -'): void {
    if (!this.shadowRoot || this.loadingToast) return;
    this.loadingToast = document.createElement('div');
    this.loadingToast.className = 'cr-loading-toast';
    this.loadingToast.textContent = text;
    this.shadowRoot.appendChild(this.loadingToast);
  }

  hideLoadingToast(): void {
    if (this.loadingToast) {
      this.loadingToast.remove();
      this.loadingToast = null;
    }
  }

  /** Unmount and clean up */
  unmount(): void {
    this.hideWordBalloon(true);
    this.hideLoadingToast();
    this.wordSpans = [];
    this.hostElement?.remove();
    this.hostElement = null;
    this.shadowRoot = null;
    this.subtitleBox = null;
    this.targetLine = null;
    this.translationLine = null;
    this.dictPopup = null;
    this.controlsBar = null;
  }

  // ─── Private Helpers ─────────────────────────────

  private createNavArrow(symbol: string, className: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = `cr-nav-arrow ${className}`;
    btn.textContent = symbol;
    btn.setAttribute('aria-label', className.includes('prev') ? 'Previous subtitle' : 'Next subtitle');
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  private createControlBtn(label: string, ariaLabel: string, onClick?: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'cr-control-btn';
    btn.textContent = label;
    btn.setAttribute('aria-label', ariaLabel);
    if (onClick) btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }
}
