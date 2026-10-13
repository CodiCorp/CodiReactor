// ─────────────────────────────────────────────────
// YouTube Search Injection: Filter and badge tools
// for finding videos with subtitles in target language
// ─────────────────────────────────────────────────

export interface SearchInjectOptions {
  targetLanguage: string;
  onFilterCC?: (enabled: boolean) => void;
  onLanguageChange?: (lang: string) => void;
}

export class YouTubeSearchInject {
  private container: HTMLElement | null = null;
  private options: SearchInjectOptions;
  private isDestroyed = false;

  constructor(options: SearchInjectOptions) {
    this.options = {
      targetLanguage: options.targetLanguage || 'English',
      onFilterCC: options.onFilterCC,
      onLanguageChange: options.onLanguageChange,
    };
  }

  /**
   * Check if current URL is a YouTube search results page.
   */
  isSearchResultsPage(url: string = window.location.href): boolean {
    return url.includes('/results') && url.includes('search_query=');
  }

  /**
   * Check if current URL already has YouTube's CC filter parameter.
   */
  hasCCFilter(url: string = window.location.href): boolean {
    return url.includes('sp=EgIoAQ') || url.includes('sp=EgIoAQ%253D%253D');
  }

  /**
   * Generate URL with or without YouTube's CC filter param.
   */
  toggleCCFilterUrl(url: string = window.location.href): string {
    const parsed = new URL(url);
    if (this.hasCCFilter(url)) {
      parsed.searchParams.delete('sp');
    } else {
      parsed.searchParams.set('sp', 'EgIoAQ==');
    }
    return parsed.toString();
  }

  /**
   * Build the UI toolbar element.
   */
  renderToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'codireactor-search-toolbar';
    bar.setAttribute('data-codireactor', 'search-tools');
    bar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      margin: 8px 0 16px 0;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 8px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      z-index: 100;
    `;

    // Logo / Brand
    const brand = document.createElement('div');
    brand.style.cssText = 'font-weight: 600; color: #60a5fa; display: flex; align-items: center; gap: 6px;';
    const brandIcon = document.createElement('span');
    brandIcon.textContent = '⚡';
    const brandText = document.createElement('span');
    brandText.textContent = 'CodiReactor Search';
    brand.append(brandIcon, brandText);
    bar.appendChild(brand);

    // CC Filter Button
    const ccBtn = document.createElement('button');
    const isCC = this.hasCCFilter();
    ccBtn.className = 'codireactor-cc-filter-btn';
    ccBtn.style.cssText = `
      background: ${isCC ? '#2563eb' : 'rgba(255, 255, 255, 0.08)'};
      border: 1px solid ${isCC ? '#3b82f6' : 'rgba(255, 255, 255, 0.15)'};
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    `;
    ccBtn.textContent = isCC ? '✓ Subtitles (CC) Active' : '+ Filter: CC Only';
    ccBtn.addEventListener('click', () => {
      if (this.options.onFilterCC) {
        this.options.onFilterCC(!isCC);
      }
      window.location.href = this.toggleCCFilterUrl();
    });
    bar.appendChild(ccBtn);

    // Target Language Tag
    const langBadge = document.createElement('span');
    langBadge.className = 'codireactor-lang-badge';
    langBadge.style.cssText = `
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    `;
    langBadge.textContent = `Target: ${this.options.targetLanguage}`;
    bar.appendChild(langBadge);

    this.container = bar;
    return bar;
  }

  /**
   * Inject toolbar into YouTube search page DOM.
   */
  inject(targetParent: HTMLElement): boolean {
    if (this.isDestroyed || !targetParent) return false;
    this.remove();
    const el = this.renderToolbar();
    targetParent.prepend(el);
    return true;
  }

  /**
   * Badge a video card if CC is detected.
   */
  badgeVideoCard(cardElement: HTMLElement, hasCC: boolean = true): HTMLElement | null {
    if (!cardElement || cardElement.querySelector('.codireactor-badge')) return null;

    const badge = document.createElement('span');
    badge.className = 'codireactor-badge';
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #1e3a8a;
      color: #93c5fd;
      border: 1px solid #3b82f6;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 6px;
    `;
    badge.textContent = hasCC ? 'CodiReactor Ready' : 'No CC';

    const titleContainer = cardElement.querySelector('#video-title') || cardElement;
    titleContainer.parentElement?.appendChild(badge);
    return badge;
  }

  /**
   * Remove injected elements.
   */
  remove(): void {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
      this.container = null;
    }
  }

  /**
   * Destroy and disconnect.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.remove();
  }
}
