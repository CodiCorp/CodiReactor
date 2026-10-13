// @vitest-environment jsdom
// ─────────────────────────────────────────────────
// Tests: YouTube Search Inject
// ─────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { YouTubeSearchInject } from '../src/ui/search/YouTubeSearchInject';

describe('YouTubeSearchInject', () => {
  let injector: YouTubeSearchInject;

  beforeEach(() => {
    injector = new YouTubeSearchInject({
      targetLanguage: 'Spanish',
    });
  });

  it('correctly detects search results page URL', () => {
    expect(injector.isSearchResultsPage('https://www.youtube.com/results?search_query=ted+talk')).toBe(true);
    expect(injector.isSearchResultsPage('https://www.youtube.com/watch?v=12345')).toBe(false);
  });

  it('detects CC filter presence in URL', () => {
    expect(injector.hasCCFilter('https://www.youtube.com/results?search_query=test&sp=EgIoAQ%253D%253D')).toBe(true);
    expect(injector.hasCCFilter('https://www.youtube.com/results?search_query=test')).toBe(false);
  });

  it('toggles CC filter parameter in URL', () => {
    const rawUrl = 'https://www.youtube.com/results?search_query=test';
    const toggledOn = injector.toggleCCFilterUrl(rawUrl);
    expect(toggledOn).toContain('sp=');

    const toggledOff = injector.toggleCCFilterUrl(toggledOn);
    expect(toggledOff).not.toContain('sp=');
  });

  it('renders toolbar with target language and buttons', () => {
    const toolbar = injector.renderToolbar();
    expect(toolbar.getAttribute('data-codireactor')).toBe('search-tools');
    expect(toolbar.textContent).toContain('CodiReactor Search');
    expect(toolbar.textContent).toContain('Target: Spanish');
  });

  it('injects toolbar into DOM and cleans up on remove', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const success = injector.inject(container);
    expect(success).toBe(true);
    expect(container.querySelector('[data-codireactor="search-tools"]')).not.toBeNull();

    injector.remove();
    expect(container.querySelector('[data-codireactor="search-tools"]')).toBeNull();
  });

  it('badges video cards without duplicating', () => {
    const card = document.createElement('div');
    const title = document.createElement('h3');
    title.id = 'video-title';
    card.appendChild(title);

    const badge1 = injector.badgeVideoCard(card, true);
    expect(badge1).not.toBeNull();
    expect(badge1?.textContent).toBe('CodiReactor Ready');

    const badge2 = injector.badgeVideoCard(card, true);
    expect(badge2).toBeNull(); // Already badged
  });
});
