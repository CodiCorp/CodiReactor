// ─────────────────────────────────────────────────
// DictionaryPopup: Builds the mini-dictionary
// popup DOM from dictionary results
// ─────────────────────────────────────────────────

import { DictionaryEntry } from '../core/types';

export interface DictionaryPopupOptions {
  entry: DictionaryEntry | null;
  externalLinks: Array<{ name: string; url: string }>;
  currentStatus: 'known' | 'learning' | 'suggested' | 'ignored' | 'special';
  onMarkKnown?: () => void;
  onMarkLearning?: () => void;
  onMarkIgnored?: () => void;
  onSavePhrase?: () => void;
  onPlayAudio?: () => void;
  onClose?: () => void;
}

/**
 * Build the mini-dictionary popup DOM element.
 */
export function buildDictionaryPopup(options: DictionaryPopupOptions): HTMLElement {
  const container = document.createElement('div');

  // ─── Top Bar: CodiReactor Brand + Close Button ───
  const topBar = document.createElement('div');
  topBar.className = 'cr-dict-top-bar';

  const brandTitle = document.createElement('span');
  brandTitle.className = 'cr-dict-brand-title';
  brandTitle.textContent = 'CodiReactor';
  topBar.appendChild(brandTitle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'cr-dict-close-btn';
  closeBtn.textContent = '✖';
  closeBtn.setAttribute('aria-label', 'Close dictionary');
  closeBtn.title = 'Close (Esc)';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    options.onClose?.();
  });
  topBar.appendChild(closeBtn);

  container.appendChild(topBar);

  // ─── Header: Word + IPA + POS + Audio ──────

  const header = document.createElement('div');
  header.className = 'cr-dict-header';

  if (options.entry) {
    const wordEl = document.createElement('span');
    wordEl.className = 'cr-dict-word';
    wordEl.textContent = options.entry.word;
    header.appendChild(wordEl);

    if (options.entry.ipa) {
      const ipaEl = document.createElement('span');
      ipaEl.className = 'cr-dict-ipa';
      ipaEl.textContent = options.entry.ipa;
      header.appendChild(ipaEl);
    }

    if (options.entry.senses.length > 0) {
      const posEl = document.createElement('span');
      posEl.className = 'cr-dict-pos';
      posEl.textContent = options.entry.senses[0].pos;
      header.appendChild(posEl);
    }

    if (options.entry.audioUrl || options.onPlayAudio) {
      const audioBtn = document.createElement('button');
      audioBtn.className = 'cr-dict-audio-btn';
      audioBtn.textContent = '🔊';
      audioBtn.setAttribute('aria-label', 'Play pronunciation');
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.onPlayAudio) {
          options.onPlayAudio();
        } else if (options.entry?.audioUrl) {
          new Audio(options.entry.audioUrl).play().catch(() => {});
        }
      });
      header.appendChild(audioBtn);
    }
  } else {
    const wordEl = document.createElement('span');
    wordEl.className = 'cr-dict-word';
    wordEl.textContent = 'No definition found';
    header.appendChild(wordEl);
  }

  container.appendChild(header);

  // ─── Definitions ───────────────────────────

  if (options.entry && options.entry.senses.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'cr-dict-divider';
    container.appendChild(divider);

    const sensesList = document.createElement('ol');
    sensesList.className = 'cr-dict-senses';

    for (let i = 0; i < options.entry.senses.length; i++) {
      const sense = options.entry.senses[i];
      for (let j = 0; j < Math.min(sense.glosses.length, 3); j++) {
        const li = document.createElement('li');
        li.setAttribute('data-index', String(i * 3 + j + 1));
        li.textContent = sense.glosses[j];
        sensesList.appendChild(li);

        // Add first example if available
        if (sense.examples && sense.examples[j]) {
          const exEl = document.createElement('div');
          exEl.className = 'cr-dict-example';
          exEl.textContent = `"${sense.examples[j]}"`;
          sensesList.appendChild(exEl);
        }
      }
    }

    container.appendChild(sensesList);
  }

  // ─── External Links ────────────────────────

  if (options.externalLinks.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'cr-dict-divider';
    container.appendChild(divider);

    const linksContainer = document.createElement('div');
    linksContainer.className = 'cr-dict-external-links';

    for (const link of options.externalLinks) {
      const a = document.createElement('a');
      a.className = 'cr-dict-external-link';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.name;
      linksContainer.appendChild(a);
    }

    container.appendChild(linksContainer);
  }

  // ─── Action Buttons ────────────────────────

  const divider = document.createElement('div');
  divider.className = 'cr-dict-divider';
  container.appendChild(divider);

  const actions = document.createElement('div');
  actions.className = 'cr-dict-actions';

  // Known button
  const knownBtn = document.createElement('button');
  knownBtn.className = 'cr-dict-action-btn cr-action-known';
  knownBtn.textContent = options.currentStatus === 'known' ? '✓ Known' : 'Know it';
  knownBtn.addEventListener('click', (e) => { e.stopPropagation(); options.onMarkKnown?.(); });
  actions.appendChild(knownBtn);

  // Learning button
  const learningBtn = document.createElement('button');
  learningBtn.className = 'cr-dict-action-btn cr-action-learning';
  learningBtn.textContent = options.currentStatus === 'learning' ? '✓ Learning' : 'Learn it';
  learningBtn.addEventListener('click', (e) => { e.stopPropagation(); options.onMarkLearning?.(); });
  actions.appendChild(learningBtn);

  // Save phrase button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'cr-dict-action-btn cr-action-save';
  saveBtn.textContent = '📌 Save';
  saveBtn.addEventListener('click', (e) => { e.stopPropagation(); options.onSavePhrase?.(); });
  actions.appendChild(saveBtn);

  // Ignore button
  const ignoreBtn = document.createElement('button');
  ignoreBtn.className = 'cr-dict-action-btn cr-action-ignore';
  ignoreBtn.textContent = 'Ignore';
  ignoreBtn.addEventListener('click', (e) => { e.stopPropagation(); options.onMarkIgnored?.(); });
  actions.appendChild(ignoreBtn);

  container.appendChild(actions);

  return container;
}
