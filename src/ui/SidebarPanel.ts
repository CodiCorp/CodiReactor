// ─────────────────────────────────────────────────
// Sidebar Panel: Right-side interactive transcript
// Matches Reference Screenshots 093356, 093424, 093439, 093511
// ─────────────────────────────────────────────────

import { SubtitleCue } from '../core/types';
import { getQuickWordTranslation, getSentenceTranslation, getCollocation } from '../services/quickTranslation';
import { tokenize } from '../core/linguistics/tokenizer';

export interface SidebarCallbacks {
  onSeek: (timeMs: number) => void;
  onWordClick: (word: string, lemma: string, element: HTMLElement) => void;
  onSavePhrase?: (cue: SubtitleCue) => void;
  onOpenSettings?: () => void;
  onPauseVideo?: () => void;
}

export class SidebarPanel {
  private container: HTMLElement | null = null;
  private cueListEl: HTMLElement | null = null;
  private hoverCardEl: HTMLElement | null = null;
  private activeTab: 'subtitles' | 'words' | 'saved' = 'subtitles';
  private cues: SubtitleCue[] = [];
  private activeCueIndex = -1;
  private savedCueIds = new Set<string>();
  private isVisible = true;
  private callbacks: SidebarCallbacks | null = null;
  private hoverTimeout: any = null;

  constructor(callbacks?: SidebarCallbacks) {
    if (callbacks) this.callbacks = callbacks;
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.id = 'codireactor-sidebar-root';
    this.container.className = 'cr-sidebar-panel';
    this.container.style.cssText = `
      position: fixed !important;
      top: 56px !important;
      right: 0 !important;
      width: 340px !important;
      height: calc(100vh - 56px) !important;
      background: #0f0f0f !important;
      border-left: 1px solid #272727 !important;
      z-index: 2147483640 !important;
      display: flex !important;
      flex-direction: column !important;
      font-family: 'Roboto', 'Segoe UI', -apple-system, sans-serif !important;
      color: #f1f1f1 !important;
      box-shadow: -4px 0 16px rgba(0, 0, 0, 0.5) !important;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      user-select: none !important;
      box-sizing: border-box !important;
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

    this.renderCues();
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
      this.renderCues();
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
    this.renderCues();
  }

  setActiveTime(timeMs: number): void {
    if (this.cues.length === 0 || !this.cueListEl) return;

    const newIndex = this.cues.findIndex(c => timeMs >= c.startMs && timeMs <= c.endMs);
    if (newIndex !== -1 && newIndex !== this.activeCueIndex) {
      this.activeCueIndex = newIndex;
      this.highlightActiveCue(newIndex);
    }
  }

  private highlightActiveCue(index: number): void {
    if (!this.cueListEl) return;

    const rows = this.cueListEl.querySelectorAll('.cr-sidebar-cue-row');
    rows.forEach((row, idx) => {
      const playIcon = row.querySelector<HTMLElement>('.cr-cue-play-icon');
      if (idx === index) {
        row.classList.add('cr-active-row');
        (row as HTMLElement).style.background = '#1a1a1a';
        if (playIcon) {
          playIcon.style.visibility = 'visible';
          playIcon.style.opacity = '1';
        }
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        row.classList.remove('cr-active-row');
        (row as HTMLElement).style.background = '#0d0d0d';
        if (playIcon) {
          playIcon.style.visibility = 'hidden';
          playIcon.style.opacity = '0.6';
        }
      }
    });
  }

  private renderCues(): void {
    if (!this.cueListEl) return;
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
        padding: 11px 14px !important;
        border-top: 1px solid #1a1a1a !important;
        background: ${isActive ? '#1a1a1a' : '#0d0d0d'} !important;
        cursor: pointer !important;
        transition: background 0.15s ease !important;
        position: relative !important;
        min-height: 40px !important;
        box-sizing: border-box !important;
      `;

      // 1. Purple Play Circle Button (▶) (Matches ref/image copy.png)
      const playCircle = document.createElement('button');
      playCircle.className = 'cr-cue-play-icon';
      playCircle.title = 'Replay this sentence';
      playCircle.setAttribute('aria-label', 'Replay this sentence');
      playCircle.style.cssText = `
        width: 20px !important;
        height: 20px !important;
        min-width: 20px !important;
        border-radius: 50% !important;
        background: #9333ea !important;
        color: #ffffff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 10px !important;
        margin-right: 10px !important;
        margin-top: 2px !important;
        visibility: ${isActive ? 'visible' : 'hidden'} !important;
        opacity: ${isActive ? '1' : '0.6'} !important;
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

        const wordSpan = document.createElement('span');
        wordSpan.textContent = token.text;
        wordSpan.className = 'cr-sidebar-word';
        wordSpan.dataset.word = token.cleanText;
        wordSpan.dataset.lemma = token.lemma;

        if (token.isPunctuation) {
          wordSpan.style.color = '#777777';
        } else {
          // CEFR color palette matching ref/image copy.png
          const wordLen = token.cleanText.length;
          let wordColor = '#7df9c2'; // mint green (common / known)
          if (wordLen >= 5 && wordLen <= 7) {
            wordColor = '#fbc18d'; // peach orange (intermediate)
          } else if (wordLen > 7) {
            wordColor = '#c084fc'; // purple violet (advanced)
          }

          wordSpan.style.cssText = `
            cursor: pointer !important;
            padding: 1px 3px !important;
            border-radius: 3px !important;
            transition: background 0.15s ease !important;
            display: inline-block !important;
            color: ${wordColor} !important;
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
        }

        textWrapper.appendChild(wordSpan);
      }

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
          row.style.background = '#141414';
          playCircle.style.visibility = 'visible';
          playCircle.style.opacity = '0.75';
        }
        actionsWrapper.style.display = 'flex';
      });

      row.addEventListener('mouseleave', () => {
        if (index !== this.activeCueIndex) {
          row.style.background = '#0d0d0d';
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

  setCallbacks(callbacks: SidebarCallbacks): void {
    this.callbacks = callbacks;
  }

  open(): void {
    if (!this.container) return;
    this.isVisible = true;
    this.container.style.transform = 'translateX(0)';
  }

  close(): void {
    if (!this.container) return;
    this.isVisible = false;
    this.container.style.transform = 'translateX(100%)';
  }

  toggle(): void {
    if (this.isVisible) this.close();
    else this.open();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  destroy(): void {
    this.container?.remove();
    this.hoverCardEl?.remove();
    this.container = null;
    this.cueListEl = null;
    this.hoverCardEl = null;
  }
}
