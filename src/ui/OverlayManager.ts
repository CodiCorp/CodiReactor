// ─────────────────────────────────────────────────
// Shadow DOM Overlay: Manages the root overlay
// container, subtitle rendering, and UI lifecycle
// ─────────────────────────────────────────────────

import { EnrichedToken, SubtitleCue, TOKEN_COLORS } from '../core/types';
import { getTokenColor, shouldOutline, type VocabularyState } from '../core/linguistics/vocabularyMatrix';
import { getQuickWordTranslation } from '../services/quickTranslation';
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

  // Callbacks
  private onWordClick: ((word: string, lemma: string, element: HTMLElement) => void) | null = null;
  private onWordRightClick: ((word: string, lemma: string) => void) | null = null;
  private onSeekPrev: (() => void) | null = null;
  private onSeekNext: (() => void) | null = null;

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

    // Subtitle box
    this.subtitleBox = document.createElement('div');
    this.subtitleBox.className = 'cr-subtitle-box';
    this.subtitleBox.setAttribute('role', 'status');
    this.subtitleBox.setAttribute('aria-label', 'Subtitles');

    this.targetLine = document.createElement('div');
    this.targetLine.className = 'cr-subtitle-target';
    this.targetLine.setAttribute('lang', 'en');
    this.targetLine.setAttribute('dir', 'ltr');

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
    });
  }

  /**
   * Render enriched tokens into the subtitle overlay.
   */
  renderTokens(tokens: EnrichedToken[], language: string = 'en'): void {
    if (!this.targetLine) return;

    // Clear existing content
    this.targetLine.innerHTML = '';
    this.targetLine.setAttribute('lang', language);

    // Set text direction
    const isRTL = ['ar', 'he', 'fa', 'ur'].includes(language);
    this.targetLine.setAttribute('dir', isRTL ? 'rtl' : 'ltr');

    for (const token of tokens) {
      if (token.isWhitespace) {
        this.targetLine.appendChild(document.createTextNode(' '));
        continue;
      }

      const span = document.createElement('span');
      span.textContent = token.text;

      if (token.isPunctuation) {
        span.className = 'cr-word cr-punctuation';
      } else {
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

        // Left-click: open dictionary & hide balloon
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideWordBalloon();
          this.onWordClick?.(token.cleanText, token.lemma, span);
        });

        // Hover: show blue balloon tooltip (Screenshots 093559 & 093623)
        span.addEventListener('mouseenter', () => {
          this.showWordBalloon(token.cleanText, span);
        });
        span.addEventListener('mouseleave', () => {
          this.hideWordBalloon();
        });

        // Right-click: toggle status
        span.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hideWordBalloon();
          this.onWordRightClick?.(token.cleanText, token.lemma);
        });

        // Keyboard enter: open dictionary
        span.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.hideWordBalloon();
            this.onWordClick?.(token.cleanText, token.lemma, span);
          }
        });
      }

      this.targetLine.appendChild(span);
    }

    // Show the subtitle box
    this.subtitleBox?.classList.remove('cr-hidden');
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

    this.dictPopup.innerHTML = '';
    this.dictPopup.appendChild(content);
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
      this.dictPopup.innerHTML = '';
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
    this.controlsBar.innerHTML = '';

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
    if (this.targetLine) this.targetLine.innerHTML = '';
    if (this.translationLine) {
      this.translationLine.textContent = '';
      this.translationLine.style.display = 'none';
    }
    this.subtitleBox?.classList.add('cr-hidden');
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
    onSeekPrev?: () => void;
    onSeekNext?: () => void;
  }): void {
    this.onWordClick = callbacks.onWordClick || null;
    this.onWordRightClick = callbacks.onWordRightClick || null;
    this.onSeekPrev = callbacks.onSeekPrev || null;
    this.onSeekNext = callbacks.onSeekNext || null;
  }

  /** Show blue balloon tooltip above hovered word (Screenshots 093559 & 093623) */
  private async showWordBalloon(word: string, anchor: HTMLElement): Promise<void> {
    if (!this.shadowRoot) return;
    this.hideWordBalloon();

    const translations = await getQuickWordTranslation(word, 'ar');
    if (!translations || translations.length === 0) return;

    this.hoverBalloon = document.createElement('div');
    this.hoverBalloon.className = 'cr-hover-balloon';

    const transWrapper = document.createElement('div');
    transWrapper.className = 'cr-balloon-translations';
    translations.slice(0, 3).forEach((tr) => {
      const line = document.createElement('div');
      line.textContent = tr;
      transWrapper.appendChild(line);
    });
    this.hoverBalloon.appendChild(transWrapper);

    const cefrBar = document.createElement('div');
    cefrBar.className = 'cr-balloon-cefr-bar';
    const cefrFill = document.createElement('div');
    cefrFill.className = 'cr-balloon-cefr-fill';
    cefrFill.style.width = '45%';
    cefrBar.appendChild(cefrFill);
    this.hoverBalloon.appendChild(cefrBar);

    this.shadowRoot.appendChild(this.hoverBalloon);

    // Position balloon directly above anchor
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

  private hideWordBalloon(): void {
    if (this.hoverBalloon) {
      this.hoverBalloon.remove();
      this.hoverBalloon = null;
    }
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
    this.hideWordBalloon();
    this.hideLoadingToast();
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
