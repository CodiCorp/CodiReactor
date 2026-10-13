// ─────────────────────────────────────────────────
// Sidebar Panel: Right-side interactive transcript
// Matches Reference Screenshots 093356, 093424, 093439, 093511
// ─────────────────────────────────────────────────

import { SubtitleCue } from '../core/types';
import { getQuickWordTranslation, getSentenceTranslation, getCollocation } from '../services/quickTranslation';
import { tokenize } from '../core/linguistics/tokenizer';
import { lookupFrequency } from '../core/linguistics/frequencyEngine';
import { lemmatize } from '../core/linguistics/lemmatizer';

export interface SidebarCallbacks {
  onSeek: (timeMs: number) => void;
  onWordClick: (word: string, lemma: string, element: HTMLElement) => void;
  onSavePhrase?: (cue: SubtitleCue) => void;
  onOpenSettings?: () => void;
  onPauseVideo?: () => void;
  onWordStatusChange?: (lemma: string, status: 'known' | 'learning' | 'ignored') => void;
  onToggleVisibility?: (visible: boolean) => void;
}

export class SidebarPanel {
  private container: HTMLElement | null = null;
  private collapsedPill: HTMLElement | null = null;
  private cueListEl: HTMLElement | null = null;
  private hoverCardEl: HTMLElement | null = null;
  private activeTab: 'subtitles' | 'words' | 'saved' = 'subtitles';
  private cues: SubtitleCue[] = [];
  private activeCueIndex = -1;
  private activeRowEl: HTMLElement | null = null;
  private savedCueIds = new Set<string>();
  private knownWords = new Set<string>();
  private learningWords = new Set<string>();
  private ignoredWords = new Set<string>();
  private dismissedGuide = false;
  private isVisible = true;
  private callbacks: SidebarCallbacks | null = null;
  private hoverTimeout: any = null;

  constructor(callbacks?: SidebarCallbacks) {
    if (callbacks) this.callbacks = callbacks;
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('cr_sidebar_active');
        if (saved !== null) {
          this.isVisible = saved === 'true';
        }
      }
    } catch { /* ignore */ }
    this.loadVocabFromStorage();
  }

  getElement(): HTMLElement | null {
    return this.container;
  }

  getCollapsedPill(): HTMLElement | null {
    return this.collapsedPill;
  }

  private loadVocabFromStorage(): void {
    try {
      const k = typeof localStorage !== 'undefined' ? localStorage.getItem('cr_known_words') : null;
      if (k) this.knownWords = new Set(JSON.parse(k));
      const l = typeof localStorage !== 'undefined' ? localStorage.getItem('cr_learning_words') : null;
      if (l) this.learningWords = new Set(JSON.parse(l));
      const ig = typeof localStorage !== 'undefined' ? localStorage.getItem('cr_ignored_words') : null;
      if (ig) this.ignoredWords = new Set(JSON.parse(ig));
    } catch { /* ignore */ }
  }

  private saveVocabToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem('cr_known_words', JSON.stringify(Array.from(this.knownWords)));
      localStorage.setItem('cr_learning_words', JSON.stringify(Array.from(this.learningWords)));
      localStorage.setItem('cr_ignored_words', JSON.stringify(Array.from(this.ignoredWords)));
    } catch { /* ignore */ }
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.container) return;

    if (typeof document !== 'undefined') {
      if (this.isVisible) {
        document.body.classList.remove('cr-sidebar-closed');
        document.body.classList.add('cr-sidebar-active');
      } else {
        document.body.classList.add('cr-sidebar-closed');
        document.body.classList.remove('cr-sidebar-active');
      }
    }

    this.container = document.createElement('div');
    this.container.id = 'codireactor-sidebar-root';
    this.container.className = 'cr-sidebar-panel';
    this.container.style.cssText = `
      width: 380px !important;
      min-width: 380px !important;
      max-width: 380px !important;
      height: 100% !important;
      background: #0f0f0f !important;
      border-left: 1px solid #272727 !important;
      z-index: 20 !important;
      display: ${this.isVisible ? 'flex' : 'none'} !important;
      flex-direction: column !important;
      font-family: 'Roboto', 'Segoe UI', -apple-system, sans-serif !important;
      color: #f1f1f1 !important;
      box-shadow: -4px 0 16px rgba(0, 0, 0, 0.5) !important;
      user-select: none !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
    `;

    // 1. Header with Tabs and Actions
    const header = document.createElement('div');
    header.className = 'cr-sidebar-header';
    header.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 0 12px !important;
      height: 44px !important;
      border-bottom: 1px solid #222222 !important;
      background: #121212 !important;
      flex-shrink: 0 !important;
    `;

    // Left Tabs
    const tabsWrapper = document.createElement('div');
    tabsWrapper.style.cssText = `
      display: flex !important;
      gap: 16px !important;
      height: 100% !important;
      align-items: center !important;
    `;

    const subTab = this.createTab('Subtitles', 'subtitles', true);
    const wordsTab = this.createTab('Words', 'words', false);
    const savedTab = this.createTab('Saved', 'saved', false);

    tabsWrapper.appendChild(subTab);
    tabsWrapper.appendChild(wordsTab);
    tabsWrapper.appendChild(savedTab);

    // Right Actions: ⚙️, ⛶, ✖
    const actionsWrapper = document.createElement('div');
    actionsWrapper.style.cssText = `
      display: flex !important;
      gap: 10px !important;
      align-items: center !important;
      color: #999999 !important;
    `;

    const settingsBtn = this.createIconButton('⚙️', 'Settings', () => {
      this.callbacks?.onOpenSettings?.();
    });
    const fullscreenBtn = this.createIconButton('⛶', 'Expand', () => {
      if (this.container) {
        const isWide = this.container.style.width === '460px';
        this.container.style.width = isWide ? '340px' : '460px';
      }
    });
    const closeBtn = this.createIconButton('✖', 'Close transcript panel', () => {
      this.close();
    });

    actionsWrapper.appendChild(settingsBtn);
    actionsWrapper.appendChild(fullscreenBtn);
    actionsWrapper.appendChild(closeBtn);

    header.appendChild(tabsWrapper);
    header.appendChild(actionsWrapper);

    // 2. Cue List Container
    this.cueListEl = document.createElement('div');
    this.cueListEl.className = 'cr-sidebar-cuelist';
    this.cueListEl.style.cssText = `
      flex: 1 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 4px 0 !important;
      scrollbar-width: thin !important;
      scrollbar-color: #333333 #121212 !important;
    `;

    // 3. Hover Lexicon Card (Screenshot 093511.png)
    this.hoverCardEl = document.createElement('div');
    this.hoverCardEl.className = 'cr-sidebar-hover-card';
    this.hoverCardEl.style.cssText = `
      position: fixed !important;
      display: none !important;
      background: #1e1e1e !important;
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 8px !important;
      padding: 10px 14px !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
      z-index: 2147483647 !important;
      min-width: 240px !important;
      max-width: 320px !important;
      color: #ffffff !important;
      font-size: 13px !important;
      line-height: 1.4 !important;
      pointer-events: auto !important;
    `;

    this.container.appendChild(header);
    this.container.appendChild(this.cueListEl);
    parent.appendChild(this.container);
    parent.appendChild(this.hoverCardEl);

    this.collapsedPill = this.createCollapsedPill();
    parent.appendChild(this.collapsedPill);

    this.renderCues();
  }

  private createCollapsedPill(): HTMLElement {
    const pill = document.createElement('div');
    pill.className = 'cr-vv-toggle-in-sidebar';
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    pill.setAttribute('title', 'Open transcript panel');
    pill.style.cssText = `
      display: ${this.isVisible ? 'none' : 'flex'} !important;
      background: #181818 !important;
      font-size: 14px !important;
      font-family: 'Roboto', Arial, sans-serif !important;
      font-weight: 500 !important;
      padding: 7px 12px !important;
      margin-bottom: 10px !important;
      cursor: pointer !important;
      color: #f1f1f1 !important;
      border-radius: 4px !important;
      box-shadow: 1px 1px 4px rgba(0, 0, 0, 0.3) !important;
      user-select: none !important;
      box-sizing: border-box !important;
      width: 100% !important;
      align-items: center !important;
      justify-content: space-between !important;
      transition: background 0.15s ease !important;
      direction: ltr !important;
    `;

    pill.addEventListener('mouseenter', () => {
      pill.style.background = '#242424';
    });
    pill.addEventListener('mouseleave', () => {
      pill.style.background = '#181818';
    });

    const labelSpan = document.createElement('span');
    labelSpan.className = 'cr-vv-toggle-label';
    labelSpan.textContent = 'Subtitles (hidden)';
    labelSpan.style.cssText = `
      color: #f1f1f1 !important;
      font-size: 14px !important;
      line-height: 18px !important;
      font-weight: 500 !important;
    `;

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'cr-vv-toggle-icon';
    iconWrapper.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 18px !important;
      height: 18px !important;
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('version', '1.1');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 384 448');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', '#ffffff');
    path.setAttribute(
      'd',
      'M203.25 324.75l113.5-113.5c6.25-6.25 6.25-16.25 0-22.5l-25.5-25.5c-6.25-6.25-16.25-6.25-22.5 0l-76.75 76.75-76.75-76.75c-6.25-6.25-16.25-6.25-22.5 0l-25.5 25.5c-6.25 6.25-6.25 16.25 0 22.5l113.5 113.5c6.25 6.25 16.25 6.25 22.5 0zM384 224c0 106-86 192-192 192s-192-86-192-192 86-192 192-192 192 86 192 192z'
    );

    svg.appendChild(path);
    iconWrapper.appendChild(svg);

    pill.appendChild(labelSpan);
    pill.appendChild(iconWrapper);

    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.open();
    });

    pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        this.open();
      }
    });

    return pill;
  }

  private createTab(label: string, tabKey: 'subtitles' | 'words' | 'saved', isActive: boolean): HTMLElement {
    const tab = document.createElement('button');
    tab.className = `cr-sidebar-tab cr-tab-${tabKey}`;
    tab.textContent = label;
    tab.style.cssText = `
      background: none !important;
      border: none !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: ${isActive ? '#ffffff' : '#999999'} !important;
      height: 100% !important;
      padding: 0 4px !important;
      border-bottom: 2px solid ${isActive ? '#a855f7' : 'transparent'} !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      outline: none !important;
    `;

    tab.addEventListener('click', () => {
      this.activeTab = tabKey;
      const allTabs = this.container?.querySelectorAll('.cr-sidebar-tab') || [];
      allTabs.forEach((t: any) => {
        t.style.color = '#999999';
        t.style.borderBottomColor = 'transparent';
      });
      tab.style.color = '#ffffff';
      tab.style.borderBottomColor = '#a855f7';
      this.renderCurrentTab();
    });

    return tab;
  }

  private createIconButton(symbol: string, title: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = symbol;
    btn.setAttribute('title', title);
    btn.style.cssText = `
      background: none !important;
      border: none !important;
      font-size: 13px !important;
      color: #888888 !important;
      cursor: pointer !important;
      padding: 2px 4px !important;
      border-radius: 4px !important;
      transition: color 0.15s ease !important;
      outline: none !important;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.color = '#ffffff'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = '#888888'; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  setCues(cues: SubtitleCue[]): void {
    this.cues = cues;
    this.renderCurrentTab();
  }

  private renderCurrentTab(): void {
    if (this.activeTab === 'subtitles') {
      this.renderCues();
    } else if (this.activeTab === 'words') {
      this.renderWordsTab();
    } else if (this.activeTab === 'saved') {
      this.renderSavedTab();
    }
  }

  setActiveTime(timeMs: number): void {
    if (this.cues.length === 0 || !this.cueListEl) return;

    const effectiveTime = timeMs + 125;
    let newIndex = -1;
    for (let i = 0; i < this.cues.length; i++) {
      const c = this.cues[i];
      if (effectiveTime >= c.startMs && effectiveTime < c.endMs) {
        newIndex = i;
        break;
      }
      if (c.startMs > effectiveTime) break;
    }

    if (newIndex !== -1 && newIndex !== this.activeCueIndex) {
      this.activeCueIndex = newIndex;
      this.highlightActiveCue(newIndex);
    }
  }

  private highlightActiveCue(index: number): void {
    if (!this.cueListEl) return;

    // Fast O(1) de-highlight previous row
    if (this.activeRowEl) {
      this.activeRowEl.classList.remove('cr-active-row');
      this.activeRowEl.style.background = '#0a0a0a';
      this.activeRowEl.style.borderColor = '#1a1a1a';
      const prevPlayIcon = this.activeRowEl.querySelector<HTMLElement>('.cr-cue-play-icon');
      if (prevPlayIcon) {
        prevPlayIcon.style.visibility = 'hidden';
        prevPlayIcon.style.opacity = '0.6';
      }
    }

    // Fast O(1) highlight new active row
    const targetRow = this.cueListEl.children[index] as HTMLElement | undefined;
    if (targetRow && targetRow.classList?.contains('cr-sidebar-cue-row')) {
      this.activeRowEl = targetRow;
      targetRow.classList.add('cr-active-row');
      targetRow.style.background = '#141414';
      targetRow.style.borderColor = '#2e2e2e';
      const playIcon = targetRow.querySelector<HTMLElement>('.cr-cue-play-icon');
      if (playIcon) {
        playIcon.style.visibility = 'visible';
        playIcon.style.opacity = '1';
      }
      targetRow.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
    }
  }

  private renderCues(): void {
    if (!this.cueListEl) return;
    this.activeRowEl = null;
    this.cueListEl.replaceChildren();

    if (this.cues.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = `
        padding: 24px 16px !important;
        text-align: center !important;
        color: #777777 !important;
        font-size: 13px !important;
      `;
      emptyMsg.textContent = 'No subtitles loaded yet.';
      this.cueListEl.appendChild(emptyMsg);
      return;
    }

    this.cues.forEach((cue, index) => {
      const row = document.createElement('div');
      row.className = 'cr-sidebar-cue-row';
      row.dataset.index = String(index);
      const isActive = index === this.activeCueIndex;

      row.style.cssText = `
        display: flex !important;
        align-items: flex-start !important;
        padding: 8px 10px !important;
        margin: 3px 6px !important;
        border-radius: 4px !important;
        border: 1px solid ${isActive ? '#2e2e2e' : '#1a1a1a'} !important;
        background: ${isActive ? '#141414' : '#0a0a0a'} !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        position: relative !important;
        min-height: 38px !important;
        box-sizing: border-box !important;
      `;

      // 1. Purple Play Circle Button (▶) (Matches image copy 7.png & image copy 8.png)
      const playCircle = document.createElement('button');
      playCircle.className = 'cr-cue-play-icon';
      playCircle.title = 'Replay this sentence';
      playCircle.setAttribute('aria-label', 'Replay this sentence');
      playCircle.style.cssText = `
        width: 18px !important;
        height: 18px !important;
        min-width: 18px !important;
        border-radius: 50% !important;
        background: #9333ea !important;
        color: #ffffff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 9px !important;
        margin-right: 8px !important;
        margin-top: 2px !important;
        visibility: ${isActive ? 'visible' : 'hidden'} !important;
        box-shadow: 0 1px 4px rgba(147, 51, 234, 0.4) !important;
        border: none !important;
        cursor: pointer !important;
        padding: 0 !important;
        outline: none !important;
        flex-shrink: 0 !important;
        transition: transform 0.15s ease, opacity 0.15s ease !important;
      `;
      playCircle.textContent = '▶';

      playCircle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeCueIndex = index;
        this.highlightActiveCue(index);
        this.callbacks?.onSeek(cue.startMs);
      });

      // 2. Sentence Text with interactive, CEFR-colored word tokens
      const textWrapper = document.createElement('div');
      textWrapper.className = 'cr-cue-text-wrapper';
      textWrapper.style.cssText = `
        flex: 1 !important;
        font-size: 13.5px !important;
        line-height: 1.45 !important;
        color: #e5e5e5 !important;
        word-break: break-word !important;
        font-family: 'Roboto', 'Nunito', -apple-system, sans-serif !important;
        font-weight: 500 !important;
      `;

      // Tokenize the sentence into interactive words
      const rawTokens = tokenize(cue.text, 'en');
      for (const token of rawTokens) {
        if (token.isWhitespace) {
          textWrapper.appendChild(document.createTextNode(' '));
          continue;
        }

        if (token.isPunctuation) {
          const punctSpan = document.createElement('span');
          punctSpan.textContent = token.text;
          punctSpan.className = 'cr-sidebar-punct';
          punctSpan.style.cssText = 'color: #888888 !important; padding: 0 !important; margin: 0 !important; display: inline !important;';
          textWrapper.appendChild(punctSpan);
          continue;
        }

        const wordSpan = document.createElement('span');
        wordSpan.textContent = token.text;
        wordSpan.className = 'cr-sidebar-word';
        wordSpan.dataset.word = token.cleanText;
        wordSpan.dataset.lemma = token.lemma;

        // Vocabulary status color system (image copy 5 & image copy 6 parity)
        let wordColor = '#c084fc'; // Default: purple violet for new unconfigured words (image copy 6 parity)
        let hasBorder = false;

        if (this.knownWords.has(token.lemma)) {
          wordColor = '#7df9c2'; // Mint green for known words
        } else if (this.learningWords.has(token.lemma)) {
          wordColor = '#fbc18d'; // Warm peach orange for learned words (image copy 5 parity)
          hasBorder = true;
        } else if (this.ignoredWords.has(token.lemma)) {
          wordColor = '#777777';
        } else {
          const wordLen = token.cleanText.length;
          if (wordLen <= 3) {
            wordColor = '#7df9c2'; // High-frequency common words (a, the, is)
          } else {
            wordColor = '#c084fc'; // New unconfigured word in purple!
          }
        }

        wordSpan.style.cssText = `
          cursor: pointer !important;
          padding: 1px 2px !important;
          border-radius: 3px !important;
          transition: background 0.15s ease !important;
          display: inline-block !important;
          color: ${wordColor} !important;
          ${hasBorder ? 'border: 1.5px solid #fbc18d !important;' : ''}
        `;

        // Word Hover: Show dark card (Screenshot 093511.png)
        wordSpan.addEventListener('mouseenter', () => {
          wordSpan.style.background = 'rgba(255, 255, 255, 0.15)';
          this.handleWordHover(token.cleanText, token.lemma, cue.text, wordSpan);
        });

        wordSpan.addEventListener('mouseleave', () => {
          wordSpan.style.background = 'transparent';
          this.hideHoverCard();
        });

        // Word Click: Immediately pause video, hide hover card & trigger dictionary
        wordSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideHoverCard();
          this.callbacks?.onPauseVideo?.();
          this.callbacks?.onWordClick?.(token.cleanText, token.lemma, wordSpan);
        });

        textWrapper.appendChild(wordSpan);
      }

      // 2b. Arabic sentence translation row (matching translate.pdf and Language Reactor)
      const transRow = document.createElement('div');
      transRow.className = 'cr-sidebar-trans-row';
      transRow.style.cssText = `
        font-size: 12.5px !important;
        line-height: 1.4 !important;
        color: #9ca3af !important;
        margin-top: 4px !important;
        direction: rtl !important;
        text-align: right !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Noto Sans Arabic", sans-serif !important;
        word-break: break-word !important;
      `;

      if (cue.translatedText) {
        transRow.textContent = cue.translatedText;
      } else {
        getSentenceTranslation(cue.text, 'ar').then((trans) => {
          if (trans) {
            cue.translatedText = trans;
            transRow.textContent = trans;
          }
        });
      }
      textWrapper.appendChild(transRow);

      // 3. Hover Actions: Bookmark Star ☆ and More ⋮
      const actionsWrapper = document.createElement('div');
      actionsWrapper.className = 'cr-cue-actions';
      actionsWrapper.style.cssText = `
        display: none !important;
        align-items: center !important;
        gap: 6px !important;
        margin-left: 8px !important;
        color: #888888 !important;
      `;

      const isSaved = this.savedCueIds.has(cue.id);
      const starBtn = document.createElement('button');
      starBtn.textContent = isSaved ? '★' : '☆';
      starBtn.setAttribute('title', 'Save phrase');
      starBtn.style.cssText = `
        background: none !important;
        border: none !important;
        font-size: 14px !important;
        color: ${isSaved ? '#eab308' : '#888888'} !important;
        cursor: pointer !important;
        padding: 0 !important;
        outline: none !important;
      `;
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.savedCueIds.has(cue.id)) {
          this.savedCueIds.delete(cue.id);
          starBtn.textContent = '☆';
          starBtn.style.color = '#888888';
        } else {
          this.savedCueIds.add(cue.id);
          starBtn.textContent = '★';
          starBtn.style.color = '#eab308';
          this.callbacks?.onSavePhrase?.(cue);
        }
      });

      actionsWrapper.appendChild(starBtn);

      // Row hover effects
      row.addEventListener('mouseenter', () => {
        if (index !== this.activeCueIndex) {
          row.style.background = '#121212';
          playCircle.style.visibility = 'visible';
          playCircle.style.opacity = '0.9';
        }
        actionsWrapper.style.display = 'flex';
      });

      row.addEventListener('mouseleave', () => {
        if (index !== this.activeCueIndex) {
          row.style.background = '#0a0a0a';
          playCircle.style.visibility = 'hidden';
          playCircle.style.opacity = '0.6';
        }
        actionsWrapper.style.display = 'none';
      });

      // Row click: Jump to video timestamp and play
      row.addEventListener('click', () => {
        this.activeCueIndex = index;
        this.highlightActiveCue(index);
        this.callbacks?.onSeek(cue.startMs);
      });

      row.appendChild(playCircle);
      row.appendChild(textWrapper);
      row.appendChild(actionsWrapper);
      this.cueListEl.appendChild(row);
    });
  }

  /**
   * Handle hovering over a word in the sidebar:
   * Displays collocation, word translation with CEFR bar, and sentence translation (Screenshot 093511.png).
   */
  private async handleWordHover(word: string, lemma: string, sentence: string, anchorEl: HTMLElement): Promise<void> {
    if (!this.hoverCardEl) return;
    clearTimeout(this.hoverTimeout);

    // Get translations asynchronously
    const [wordTrans, sentenceTrans] = await Promise.all([
      getQuickWordTranslation(word, 'ar'),
      getSentenceTranslation(sentence, 'ar'),
    ]);
    const collocation = getCollocation(word);

    // Build card content
    this.hoverCardEl.replaceChildren();

    // Line 1: Collocation / Phrase
    if (collocation) {
      const line1 = document.createElement('div');
      line1.style.cssText = `
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 6px !important;
      `;
      const colText = document.createElement('span');
      colText.style.cssText = 'color: #facc15; font-weight: 600;';
      colText.textContent = collocation.text;

      const colTrans = document.createElement('span');
      colTrans.style.cssText = 'color: #ffffff; direction: rtl;';
      colTrans.textContent = `: ${collocation.translation}`;

      line1.appendChild(colText);
      line1.appendChild(colTrans);
      this.hoverCardEl.appendChild(line1);
    }

    // Line 2: CEFR mini bar + Word + Arabic definitions
    const line2 = document.createElement('div');
    line2.style.cssText = `
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      margin-bottom: 8px !important;
    `;
    const bar = document.createElement('span');
    bar.style.cssText = 'display: inline-block; width: 14px; height: 5px; background: #84cc16; border-radius: 2px;';

    const wordEl = document.createElement('span');
    wordEl.style.cssText = 'color: #ffffff; font-weight: 500;';
    wordEl.textContent = word;

    if (wordTrans && wordTrans.length > 0) {
      const transEl = document.createElement('span');
      transEl.style.cssText = 'color: #cccccc; direction: rtl; margin-left: auto;';
      transEl.textContent = `: ${wordTrans.slice(0, 3).join(', ')}`;
      line2.appendChild(transEl);
    }

    line2.appendChild(bar);
    line2.appendChild(wordEl);
    this.hoverCardEl.appendChild(line2);

    // Divider and Line 3 if Arabic sentence translation exists
    if (sentenceTrans) {
      const divider = document.createElement('div');
      divider.style.cssText = `
        height: 1px !important;
        background: rgba(255, 255, 255, 0.15) !important;
        margin: 6px 0 8px 0 !important;
      `;
      this.hoverCardEl.appendChild(divider);

      const line3 = document.createElement('div');
      line3.style.cssText = `
        color: #e5e5e5 !important;
        direction: rtl !important;
        text-align: right !important;
        font-size: 13.5px !important;
        line-height: 1.4 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Noto Sans Arabic", sans-serif !important;
      `;
      line3.textContent = sentenceTrans;
      this.hoverCardEl.appendChild(line3);
    }

    // Position the hover card to the left of the anchor
    const rect = anchorEl.getBoundingClientRect();
    const cardW = 280;
    let top = rect.top - 20;
    let left = rect.left - cardW - 14;

    if (left < 10) left = rect.right + 14; // Fallback to right if clipped
    if (top < 10) top = 10;

    this.hoverCardEl.style.top = `${top}px`;
    this.hoverCardEl.style.left = `${left}px`;
    this.hoverCardEl.style.display = 'block';
  }

  private hideHoverCard(): void {
    this.hoverTimeout = setTimeout(() => {
      if (this.hoverCardEl) {
        this.hoverCardEl.style.display = 'none';
      }
    }, 150);
  }

  /**
   * Render the Words tab: displays words from this video sorted by frequency rank
   * (Matches Screenshot ref/image copy 3.png)
   */
  private renderWordsTab(): void {
    if (!this.cueListEl) return;
    this.cueListEl.replaceChildren();

    if (this.cues.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = `
        padding: 32px 16px !important;
        text-align: center !important;
        color: #71717a !important;
        font-size: 13px !important;
      `;
      emptyMsg.textContent = 'No words loaded yet. Start video playback.';
      this.cueListEl.appendChild(emptyMsg);
      return;
    }

    // 1. Turtle Mascot Guide Card (Screenshot image copy 3.png)
    if (!this.dismissedGuide) {
      const guideBox = document.createElement('div');
      guideBox.className = 'cr-words-guide-box';
      guideBox.style.cssText = `
        margin: 12px 12px 10px 12px !important;
        padding: 12px 14px !important;
        background: #1c1c1e !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-radius: 8px !important;
        box-sizing: border-box !important;
      `;

      const guideHeader = document.createElement('div');
      guideHeader.style.cssText = `
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 8px !important;
      `;
      const title = document.createElement('span');
      title.textContent = 'Words from this video, sorted by frequency';
      title.style.cssText = 'font-weight: 600; font-size: 13px; color: #f4f4f5;';
      const turtle = document.createElement('span');
      turtle.textContent = '🐢';
      turtle.style.cssText = 'font-size: 20px;';

      guideHeader.appendChild(title);
      guideHeader.appendChild(turtle);
      guideBox.appendChild(guideHeader);

      const bullets = document.createElement('div');
      bullets.style.cssText = 'font-size: 12px; color: #a1a1aa; line-height: 1.6; margin-bottom: 8px;';
      
      const b1 = document.createElement('div');
      b1.textContent = '• Right-click to mark a word';
      const b2 = document.createElement('div');
      b2.textContent = '• Left click for dictionary and examples';
      bullets.appendChild(b1);
      bullets.appendChild(b2);
      guideBox.appendChild(bullets);

      const okRow = document.createElement('div');
      okRow.style.cssText = 'display: flex; justify-content: flex-end;';
      const okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.style.cssText = `
        background: #27272a !important;
        border: 1px solid #3f3f46 !important;
        color: #ffffff !important;
        padding: 3px 12px !important;
        border-radius: 4px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
      `;
      okBtn.addEventListener('click', () => {
        this.dismissedGuide = true;
        guideBox.remove();
      });
      okRow.appendChild(okBtn);
      guideBox.appendChild(okRow);

      this.cueListEl.appendChild(guideBox);
    }

    // 2. Extract and lemmatize all unique words from cues
    const wordMap = new Map<string, { word: string; lemma: string; count: number; rank: number }>();
    for (const cue of this.cues) {
      const tokens = tokenize(cue.text, 'en');
      for (const t of tokens) {
        if (t.isPunctuation || t.isWhitespace) continue;
        const clean = t.cleanText.toLowerCase();
        if (clean.length < 1 || /^\d+$/.test(clean)) continue;
        const lemma = lemmatize(clean, 'en').toLowerCase();
        if (!wordMap.has(lemma)) {
          const freq = lookupFrequency(lemma);
          const rank = freq?.rank || 1500;
          wordMap.set(lemma, { word: clean, lemma, count: 1, rank });
        } else {
          wordMap.get(lemma)!.count++;
        }
      }
    }

    const allWordItems = Array.from(wordMap.values());
    const totalUnique = allWordItems.length;

    // Calculate status counts
    let knownCount = 0;
    let learningCount = 0;
    let ignoredCount = 0;

    for (const item of allWordItems) {
      if (this.knownWords.has(item.lemma)) knownCount++;
      else if (this.learningWords.has(item.lemma)) learningCount++;
      else if (this.ignoredWords.has(item.lemma)) ignoredCount++;
    }

    // 3. Status Badges Bar (Matches Screenshot ref/image copy 3.png)
    const statsBar = document.createElement('div');
    statsBar.className = 'cr-words-stats-bar';
    statsBar.style.cssText = `
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      align-items: center !important;
      padding: 0 12px 10px 12px !important;
    `;

    // Known badge [✓ N]
    const knownBadge = this.createStatPill(`✓ ${knownCount}`, '#15803d', '#22c55e');
    // Learning badge [📖 N]
    const learningBadge = this.createStatPill(`📖 ${learningCount}`, '#854d0e', '#eab308');
    // Ignored badge [🚫 N]
    const ignoredBadge = this.createStatPill(`🚫 ${ignoredCount}`, '#27272a', '#71717a');
    // Total badge [/ N]
    const totalBadge = this.createStatPill(`/ ${totalUnique}`, '#1e1b4b', '#6366f1');

    statsBar.appendChild(knownBadge);
    statsBar.appendChild(learningBadge);
    statsBar.appendChild(ignoredBadge);
    statsBar.appendChild(totalBadge);

    // Filter tags [# 0]
    for (let i = 0; i < 4; i++) {
      const hashPill = this.createStatPill('# 0', '#18181b', '#3f3f46');
      hashPill.style.color = '#71717a';
      statsBar.appendChild(hashPill);
    }

    this.cueListEl.appendChild(statsBar);

    // 4. Group words into Frequency Rank Buckets:
    // Rank 1-100, Rank 101-200, Rank 201-300, Rank 301-400, Rank 401-500, etc.
    const buckets: Array<{ title: string; min: number; max: number; words: typeof allWordItems }> = [
      { title: 'Rank 1 - 100', min: 1, max: 100, words: [] },
      { title: 'Rank 101 - 200', min: 101, max: 200, words: [] },
      { title: 'Rank 201 - 300', min: 201, max: 300, words: [] },
      { title: 'Rank 301 - 400', min: 301, max: 400, words: [] },
      { title: 'Rank 401 - 500', min: 401, max: 500, words: [] },
      { title: 'Rank 501+', min: 501, max: Infinity, words: [] },
    ];

    allWordItems.sort((a, b) => a.rank - b.rank);

    for (const item of allWordItems) {
      let placed = false;
      for (const bucket of buckets) {
        if (item.rank >= bucket.min && item.rank <= bucket.max) {
          bucket.words.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        buckets[buckets.length - 1].words.push(item);
      }
    }

    // 5. Render Rank Sections and Words Grid (Screenshot image copy 3.png)
    for (const bucket of buckets) {
      if (bucket.words.length === 0) continue;

      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'cr-rank-header';
      sectionHeader.textContent = bucket.title;
      sectionHeader.style.cssText = `
        background: #27272a !important;
        border-top: 1px solid #3f3f46 !important;
        border-bottom: 1px solid #3f3f46 !important;
        padding: 5px 12px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #d4d4d8 !important;
        letter-spacing: 0.02em !important;
      `;
      this.cueListEl.appendChild(sectionHeader);

      const wordsContainer = document.createElement('div');
      wordsContainer.className = 'cr-rank-words-grid';
      wordsContainer.style.cssText = `
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px 10px !important;
        padding: 10px 12px 14px 12px !important;
        background: #0d0d0d !important;
      `;

      for (const item of bucket.words) {
        const chip = document.createElement('span');
        chip.className = 'cr-vocab-chip';
        chip.textContent = item.word;

        // Color coding based on status (Parity with ref/image copy 5.png & image copy 6.png)
        let color = '#c084fc'; // Purple for new unconfigured words (image copy 6)
        let isStrikethrough = false;
        let isLearning = false;

        if (this.knownWords.has(item.lemma)) {
          color = '#7df9c2'; // Mint green for known words
        } else if (this.learningWords.has(item.lemma)) {
          color = '#fbc18d'; // Warm peach orange for learning words (image copy 5)
          isLearning = true;
        } else if (this.ignoredWords.has(item.lemma)) {
          color = '#71717a'; // Ignored gray
          isStrikethrough = true;
        }

        chip.style.cssText = `
          cursor: pointer !important;
          font-size: 13.5px !important;
          font-weight: 500 !important;
          color: ${color} !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          ${isLearning ? 'border: 1px solid #fbc18d !important;' : ''}
          text-decoration: ${isStrikethrough ? 'line-through' : 'none'} !important;
          transition: background 0.15s ease !important;
          user-select: none !important;
        `;

        chip.addEventListener('mouseenter', () => {
          chip.style.background = 'rgba(255, 255, 255, 0.12)';
        });
        chip.addEventListener('mouseleave', () => {
          chip.style.background = 'transparent';
        });

        // Left-click: Open dictionary popup
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this.callbacks?.onPauseVideo?.();
          this.callbacks?.onWordClick(item.word, item.lemma, chip);
        });

        // Right-click: Open Quick Status Context Menu (Mark as Known / Learning / Ignore)
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showWordStatusMenu(item.word, item.lemma, e.clientX, e.clientY);
        });

        wordsContainer.appendChild(chip);
      }

      this.cueListEl.appendChild(wordsContainer);
    }
  }

  private createStatPill(text: string, bg: string, border: string): HTMLElement {
    const pill = document.createElement('span');
    pill.textContent = text;
    pill.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      background: ${bg} !important;
      border: 1px solid ${border} !important;
      color: #ffffff !important;
      font-size: 11.5px !important;
      font-weight: 700 !important;
      padding: 3px 8px !important;
      border-radius: 6px !important;
      line-height: 1 !important;
    `;
    return pill;
  }

  private showWordStatusMenu(word: string, lemma: string, x: number, y: number): void {
    // Remove any existing status menus first (prevents stacking)
    const existingMenus = document.querySelectorAll('.cr-floating-status-menu');
    existingMenus.forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'cr-floating-status-menu';

    // Position with viewport clamping to prevent off-screen placement
    const menuWidth = 180;
    const menuHeight = 165;
    const safeX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
    const safeY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

    menu.style.cssText = `
      position: fixed !important;
      top: ${safeY}px !important;
      left: ${safeX}px !important;
      background: #18181b !important;
      border: 1px solid #3f3f46 !important;
      border-radius: 8px !important;
      padding: 6px !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      min-width: 170px !important;
    `;

    const title = document.createElement('div');
    title.textContent = `Word: "${word}"`;
    title.style.cssText = 'font-size: 11px; font-weight: 700; color: #a1a1aa; padding: 4px 8px; border-bottom: 1px solid #27272a;';
    menu.appendChild(title);

    const makeOption = (label: string, color: string, action: () => void) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        background: none !important;
        border: none !important;
        color: ${color} !important;
        font-size: 12.5px !important;
        font-weight: 600 !important;
        text-align: left !important;
        padding: 6px 8px !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        transition: background 0.15s ease !important;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.background = '#27272a'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        action();
        removeMenu();
      });
      return btn;
    };

    menu.appendChild(makeOption('✓ Mark as Known (1)', '#7df9c2', () => {
      this.knownWords.add(lemma);
      this.learningWords.delete(lemma);
      this.ignoredWords.delete(lemma);
      this.saveVocabToStorage();
      this.callbacks?.onWordStatusChange?.(lemma, 'known');
      this.renderWordsTab();
    }));

    menu.appendChild(makeOption('📖 Mark as Learning (2)', '#fbc18d', () => {
      this.learningWords.add(lemma);
      this.knownWords.delete(lemma);
      this.ignoredWords.delete(lemma);
      this.saveVocabToStorage();
      this.callbacks?.onWordStatusChange?.(lemma, 'learning');
      this.renderWordsTab();
    }));

    menu.appendChild(makeOption('🚫 Don\'t Learn / Ignore (3)', '#71717a', () => {
      this.ignoredWords.add(lemma);
      this.knownWords.delete(lemma);
      this.learningWords.delete(lemma);
      this.saveVocabToStorage();
      this.callbacks?.onWordStatusChange?.(lemma, 'ignored');
      this.renderWordsTab();
    }));

    document.body.appendChild(menu);

    // Unified cleanup function
    const removeMenu = () => {
      menu.remove();
      document.removeEventListener('mousedown', outsideClickHandler);
      document.removeEventListener('contextmenu', outsideContextHandler);
      window.removeEventListener('scroll', removeMenu);
      window.removeEventListener('resize', removeMenu);
    };

    // Close on click outside the menu
    const outsideClickHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        removeMenu();
      }
    };

    // Close on right-click outside (so new right-click replaces old menu)
    const outsideContextHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        removeMenu();
      }
    };

    // Defer listeners to avoid immediate trigger from the opening contextmenu event
    setTimeout(() => {
      document.addEventListener('mousedown', outsideClickHandler);
      document.addEventListener('contextmenu', outsideContextHandler);
      window.addEventListener('scroll', removeMenu, { once: true });
      window.addEventListener('resize', removeMenu, { once: true });
    }, 50);
  }

  private renderSavedTab(): void {
    if (!this.cueListEl) return;
    this.cueListEl.replaceChildren();

    // 1. Saved Words (Words marked for practice)
    let savedWords: Array<{ word: string; lemma: string; sentence: string }> = [];
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('cr_saved_words_list');
        if (raw) savedWords = JSON.parse(raw);
      }
    } catch { /* ignore */ }

    // If learningWords has items not in savedWords list, add them too
    for (const lw of this.learningWords) {
      if (!savedWords.some(sw => sw.lemma === lw)) {
        savedWords.push({ word: lw, lemma: lw, sentence: '' });
      }
    }

    const savedCues = this.cues.filter(c => this.savedCueIds.has(c.id));

    if (savedWords.length === 0 && savedCues.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = `
        padding: 32px 16px !important;
        text-align: center !important;
        color: #71717a !important;
        font-size: 13px !important;
      `;
      emptyMsg.textContent = 'No saved words or phrases yet. Right-click a word or click ☆ on any sentence to save.';
      this.cueListEl.appendChild(emptyMsg);
      return;
    }

    if (savedWords.length > 0) {
      const wordsHeader = document.createElement('div');
      wordsHeader.className = 'cr-rank-header';
      wordsHeader.textContent = `Saved Words (${savedWords.length})`;
      wordsHeader.style.cssText = `
        background: #27272a !important;
        border-top: 1px solid #3f3f46 !important;
        border-bottom: 1px solid #3f3f46 !important;
        padding: 6px 12px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #fbc18d !important;
        letter-spacing: 0.02em !important;
      `;
      this.cueListEl.appendChild(wordsHeader);

      const wordsGrid = document.createElement('div');
      wordsGrid.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
        padding: 8px 12px !important;
        background: #0d0d0d !important;
      `;

      savedWords.forEach((sw) => {
        const itemRow = document.createElement('div');
        itemRow.style.cssText = `
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 6px 8px !important;
          border-radius: 6px !important;
          background: #18181b !important;
          border: 1px solid rgba(251, 193, 141, 0.3) !important;
        `;

        const wordInfo = document.createElement('div');
        wordInfo.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

        const wordTitle = document.createElement('span');
        wordTitle.textContent = sw.word;
        wordTitle.style.cssText = 'color: #fbc18d; font-weight: 600; font-size: 13.5px;';
        wordInfo.appendChild(wordTitle);

        if (sw.sentence) {
          const sentContext = document.createElement('span');
          sentContext.textContent = sw.sentence;
          sentContext.style.cssText = 'color: #a1a1aa; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;';
          wordInfo.appendChild(sentContext);
        }

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.title = 'Remove saved word';
        delBtn.style.cssText = 'background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px;';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.learningWords.delete(sw.lemma);
          this.saveVocabToStorage();
          try {
            const raw = localStorage.getItem('cr_saved_words_list');
            if (raw) {
              const list = JSON.parse(raw).filter((x: any) => x.lemma !== sw.lemma);
              localStorage.setItem('cr_saved_words_list', JSON.stringify(list));
            }
          } catch { /* ignore */ }
          this.renderSavedTab();
        });

        itemRow.appendChild(wordInfo);
        itemRow.appendChild(delBtn);
        wordsGrid.appendChild(itemRow);
      });

      this.cueListEl.appendChild(wordsGrid);
    }

    if (savedCues.length > 0) {
      const cuesHeader = document.createElement('div');
      cuesHeader.className = 'cr-rank-header';
      cuesHeader.textContent = `Saved Phrases (${savedCues.length})`;
      cuesHeader.style.cssText = `
        background: #27272a !important;
        border-top: 1px solid #3f3f46 !important;
        border-bottom: 1px solid #3f3f46 !important;
        padding: 6px 12px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #d4d4d8 !important;
        letter-spacing: 0.02em !important;
      `;
      this.cueListEl.appendChild(cuesHeader);

      savedCues.forEach((cue) => {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex !important;
          align-items: flex-start !important;
          padding: 10px 14px !important;
          border-top: 1px solid #1a1a1a !important;
          background: #0d0d0d !important;
          gap: 10px !important;
        `;

        const playBtn = document.createElement('button');
        playBtn.textContent = '▶';
        playBtn.style.cssText = `
          width: 20px !important;
          height: 20px !important;
          border-radius: 50% !important;
          background: #9333ea !important;
          color: #fff !important;
          border: none !important;
          cursor: pointer !important;
          font-size: 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        `;
        playBtn.addEventListener('click', () => this.callbacks?.onSeek(cue.startMs));

        const text = document.createElement('div');
        text.textContent = cue.text;
        text.style.cssText = 'flex: 1; font-size: 13px; color: #e5e5e5;';

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.style.cssText = 'background:none; border:none; cursor:pointer; font-size:12px;';
        delBtn.addEventListener('click', () => {
          this.savedCueIds.delete(cue.id);
          this.renderSavedTab();
        });

        row.appendChild(playBtn);
        row.appendChild(text);
        row.appendChild(delBtn);
        this.cueListEl.appendChild(row);
      });
    }
  }

  setCallbacks(callbacks: SidebarCallbacks): void {
    this.callbacks = callbacks;
  }

  setWordStatus(lemma: string, status: 'known' | 'learning' | 'ignored'): void {
    const clean = lemma.toLowerCase();
    if (status === 'known') {
      this.knownWords.add(clean);
      this.learningWords.delete(clean);
      this.ignoredWords.delete(clean);
    } else if (status === 'learning') {
      this.learningWords.add(clean);
      this.knownWords.delete(clean);
      this.ignoredWords.delete(clean);
    } else if (status === 'ignored') {
      this.ignoredWords.add(clean);
      this.knownWords.delete(clean);
      this.learningWords.delete(clean);
    }
    this.saveVocabToStorage();
    if (this.activeTab === 'words') {
      this.renderWordsTab();
    } else if (this.activeTab === 'subtitles') {
      this.renderCues();
    }
  }

  addSavedWord(word: string, lemma: string, sentence: string): void {
    const clean = lemma.toLowerCase();
    this.learningWords.add(clean);
    this.knownWords.delete(clean);
    this.ignoredWords.delete(clean);
    this.saveVocabToStorage();

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('cr_saved_words_list');
        const list: Array<{ word: string; lemma: string; sentence: string; date: number }> = raw ? JSON.parse(raw) : [];
        if (!list.some(item => item.lemma === clean)) {
          list.push({ word, lemma: clean, sentence, date: Date.now() });
          localStorage.setItem('cr_saved_words_list', JSON.stringify(list));
        }
      }
    } catch { /* ignore */ }

    if (this.activeTab === 'saved') {
      this.renderSavedTab();
    } else if (this.activeTab === 'words') {
      this.renderWordsTab();
    }
  }

  open(): void {
    if (!this.container) return;
    this.isVisible = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cr_sidebar_active', 'true');
      }
    } catch { /* ignore */ }

    if (typeof document !== 'undefined') {
      document.body.classList.remove('cr-sidebar-closed');
      document.body.classList.add('cr-sidebar-active');
    }
    this.container.style.display = 'flex';
    this.container.style.transform = 'translateX(0)';
    if (this.collapsedPill) {
      this.collapsedPill.style.display = 'none';
    }
    this.callbacks?.onToggleVisibility?.(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  }

  close(): void {
    if (!this.container) return;
    this.isVisible = false;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cr_sidebar_active', 'false');
      }
    } catch { /* ignore */ }

    if (typeof document !== 'undefined') {
      document.body.classList.add('cr-sidebar-closed');
      document.body.classList.remove('cr-sidebar-active');
    }
    this.container.style.display = 'none';
    this.container.style.transform = 'translateX(100%)';
    if (this.collapsedPill) {
      this.collapsedPill.style.display = 'flex';
    }
    this.callbacks?.onToggleVisibility?.(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  }

  toggle(): void {
    if (this.isVisible) this.close();
    else this.open();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  destroy(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('cr-sidebar-active');
      document.body.classList.remove('cr-sidebar-closed');
    }
    this.container?.remove();
    this.collapsedPill?.remove();
    this.hoverCardEl?.remove();
    this.container = null;
    this.collapsedPill = null;
    this.cueListEl = null;
    this.hoverCardEl = null;
  }
}
