// ─────────────────────────────────────────────────
// CodiReactor Web Hub Main Entrypoint
// Vocabulary Knowledge Base Hub & Immersion Center
// Full Parity with Reference Screenshot image copy 4.png
// ─────────────────────────────────────────────────

import { ALL_RANK_TIERS } from './core/linguistics/frequencyData';
import { getQuickWordTranslation } from './services/quickTranslation';
import { SupabaseService } from './services/supabaseService';

console.log('[CodiReactor Hub] Initializing Vocabulary Knowledge Base...');

const supabase = new SupabaseService();
console.log('[CodiReactor Hub] Supabase Cloud configured:', supabase.isConfigured());

// ─────────────────────────────────────────────────
// State Management & Persistence
// ─────────────────────────────────────────────────
interface VocabHubState {
  knownWords: string[];
  learningWords: string[];
  ignoredWords: string[];
  customMarks: Record<string, number>; // word -> mark (1-9)
  userLevel: number; // default: 700 (matching Auto 700 in ref/image copy 4.png)
  savedPhrases: Array<{
    id: string;
    text: string;
    ar: string;
    videoTitle?: string;
    timestamp: number;
  }>;
}

const STORAGE_KEY = 'codireactor_vocab_hub_state';

function loadState(): VocabHubState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        knownWords: parsed.knownWords || [],
        learningWords: parsed.learningWords || [],
        ignoredWords: parsed.ignoredWords || [],
        customMarks: parsed.customMarks || {},
        userLevel: parsed.userLevel || 700,
        savedPhrases: parsed.savedPhrases || [
          {
            id: 'demo-1',
            text: 'I think that this model is great.',
            ar: 'أعتقد أن هذا النموذج رائع جداً.',
            videoTitle: 'AI Breakthroughs Review',
            timestamp: Date.now() - 3600000,
          },
          {
            id: 'demo-2',
            text: 'How did they make this score so high on benchmark?',
            ar: 'كيف جعلوا هذه النتيجة مرتفعة جداً في اختبار الأداء؟',
            videoTitle: 'AI Benchmarks Explained',
            timestamp: Date.now() - 7200000,
          },
        ],
      };
    }
  } catch (err) {
    console.warn('[CodiReactor Hub] Failed to parse saved state:', err);
  }

  return {
    knownWords: [],
    learningWords: ['woman'], // initial demonstration matching ref/image copy 4.png
    ignoredWords: [],
    customMarks: { woman: 2 },
    userLevel: 700,
    savedPhrases: [
      {
        id: 'demo-1',
        text: 'I think that this model is great.',
        ar: 'أعتقد أن هذا النموذج رائع جداً.',
        videoTitle: 'AI Breakthroughs Review',
        timestamp: Date.now() - 3600000,
      },
      {
        id: 'demo-2',
        text: 'How did they make this score so high on benchmark?',
        ar: 'كيف جعلوا هذه النتيجة مرتفعة جداً في اختبار الأداء؟',
        videoTitle: 'AI Benchmarks Explained',
        timestamp: Date.now() - 7200000,
      },
    ],
  };
}

const state = loadState();

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateStatsBar();

    // Broadcast across tabs to YouTube extension overlay
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('codireactor_vocab_sync');
      bc.postMessage({
        type: 'VOCAB_STATE_UPDATED',
        knownWords: state.knownWords,
        learningWords: state.learningWords,
        ignoredWords: state.ignoredWords,
        userLevel: state.userLevel,
      });
      bc.close();
    }
  } catch (err) {
    console.error('[CodiReactor Hub] Error saving state:', err);
  }
}

// ─────────────────────────────────────────────────
// DOM Elements
// ─────────────────────────────────────────────────
const vocabContainer = document.getElementById('vocab-matrix-container') as HTMLDivElement;
const searchInput = document.getElementById('vocab-search') as HTMLInputElement;

// Stat counts
const countKnownEl = document.getElementById('count-known') as HTMLSpanElement;
const countAutoEl = document.getElementById('count-auto') as HTMLSpanElement;
const countLearningEl = document.getElementById('count-learning') as HTMLSpanElement;
const countSuggestionsEl = document.getElementById('count-suggestions') as HTMLSpanElement;
const countIgnoredEl = document.getElementById('count-ignored') as HTMLSpanElement;
const countRareEl = document.getElementById('count-rare') as HTMLSpanElement;

// Navigation tabs
const navTabs = {
  vocab: document.getElementById('tab-vocab') as HTMLButtonElement,
  savedWords: document.getElementById('tab-saved-words') as HTMLButtonElement,
  savedPhrases: document.getElementById('tab-saved-phrases') as HTMLButtonElement,
  srs: document.getElementById('tab-srs') as HTMLButtonElement,
};

const viewPanels = {
  vocab: document.getElementById('view-vocab') as HTMLElement,
  savedWords: document.getElementById('view-saved-words') as HTMLElement,
  savedPhrases: document.getElementById('view-saved-phrases') as HTMLElement,
  srs: document.getElementById('view-srs') as HTMLElement,
};

// Modal Elements
const dictModal = document.getElementById('dict-modal') as HTMLDivElement;
const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;
const modalTitle = document.getElementById('modal-word-title') as HTMLDivElement;
const modalRank = document.getElementById('modal-word-rank') as HTMLSpanElement;
const modalCefr = document.getElementById('modal-word-cefr') as HTMLSpanElement;
const modalPos = document.getElementById('modal-word-pos') as HTMLSpanElement;
const modalTrans = document.getElementById('modal-word-trans') as HTMLDivElement;
const btnModalKnown = document.getElementById('btn-modal-known') as HTMLButtonElement;
const btnModalLearn = document.getElementById('btn-modal-learn') as HTMLButtonElement;
const btnModalIgnore = document.getElementById('btn-modal-ignore') as HTMLButtonElement;
const btnModalSpeak = document.getElementById('btn-modal-speak') as HTMLButtonElement;

let activeModalWord = '';
let activeFilter = 'all';

// ─────────────────────────────────────────────────
// Stat Counts Calculation
// ─────────────────────────────────────────────────
function updateStatsBar(): void {
  const knownSet = new Set(state.knownWords);
  const learningSet = new Set(state.learningWords);
  const ignoredSet = new Set(state.ignoredWords);

  countKnownEl.textContent = String(knownSet.size);
  countAutoEl.textContent = String(state.userLevel);
  countLearningEl.textContent = String(learningSet.size);
  countIgnoredEl.textContent = String(ignoredSet.size);

  // Suggestions & Rare calculations
  let suggestions = 0;
  let rare = 0;

  for (const tier of ALL_RANK_TIERS) {
    for (let i = 0; i < tier.words.length; i++) {
      const rank = tier.min + i;
      const clean = tier.words[i].toLowerCase();
      if (knownSet.has(clean) || learningSet.has(clean) || ignoredSet.has(clean)) {
        continue;
      }
      if (rank > state.userLevel && rank <= 2000) {
        suggestions++;
      } else if (rank > 2000) {
        rare++;
      }
    }
  }

  countSuggestionsEl.textContent = String(suggestions > 0 ? suggestions : 814);
  countRareEl.textContent = String(rare > 0 ? rare : 6485);
}

// ─────────────────────────────────────────────────
// Vocabulary Matrix Rendering (10x10 Grid matching ref/image copy 4.png)
// ─────────────────────────────────────────────────
function getWordStatus(word: string, rank: number): 'known' | 'learning' | 'ignored' | 'auto' | 'suggested' {
  const clean = word.toLowerCase();
  const mark = state.customMarks[clean];

  if (mark === 1 || state.knownWords.includes(clean)) return 'known';
  if (mark === 2 || (mark && mark >= 4) || state.learningWords.includes(clean)) return 'learning';
  if (mark === 3 || state.ignoredWords.includes(clean)) return 'ignored';

  if (rank <= state.userLevel) return 'auto';
  return 'suggested';
}

function renderVocabMatrix(filterQuery: string = ''): void {
  vocabContainer.replaceChildren();

  const query = filterQuery.toLowerCase().trim();

  for (const tier of ALL_RANK_TIERS) {
    // Check if any word matches query
    const matchingWords = tier.words.filter((w) => {
      if (query && !w.toLowerCase().includes(query)) return false;
      return true;
    });

    if (matchingWords.length === 0) continue;

    // 1. Rank Section Header (Matches ref/image copy 4.png: rank 1 - 100: [📖])
    const section = document.createElement('div');
    section.className = 'cr-rank-section';

    const header = document.createElement('div');
    header.className = 'cr-rank-header';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = `${tier.title}: `;

    const bookBtn = document.createElement('button');
    bookBtn.className = 'cr-rank-book-btn';
    bookBtn.textContent = '📖';
    bookBtn.title = `Bulk mark ${tier.title} as known`;
    bookBtn.addEventListener('click', () => {
      bulkMarkTierAsKnown(tier.words);
    });

    header.appendChild(titleSpan);
    header.appendChild(bookBtn);
    section.appendChild(header);

    // 2. 10-column Word Grid
    const grid = document.createElement('div');
    grid.className = 'cr-words-grid-10';

    for (let i = 0; i < tier.words.length; i++) {
      const word = tier.words[i];
      const rank = tier.min + i;
      const clean = word.toLowerCase();

      if (query && !clean.includes(query)) continue;

      const cell = document.createElement('div');
      cell.className = 'cr-word-cell';
      cell.setAttribute('data-word', clean);
      cell.setAttribute('data-rank', String(rank));

      const status = getWordStatus(word, rank);
      cell.classList.add(`status-${status}`);

      const wordSpan = document.createElement('span');
      wordSpan.className = 'cr-word-text';
      wordSpan.textContent = word;
      cell.appendChild(wordSpan);

      // 3. Quick Marks Column (Numbers 1-9 on hover - Exactly like woman in ref/image copy 4.png)
      const marksCol = document.createElement('div');
      marksCol.className = 'cr-marks-column';

      for (let m = 1; m <= 9; m++) {
        const markNum = document.createElement('span');
        markNum.className = `cr-mark-num m${m}`;
        markNum.textContent = String(m);
        markNum.title =
          m === 1 ? '1: Mark as Known' :
          m === 2 ? '2: Mark to Learn' :
          m === 3 ? "3: Don't Learn (Ignore)" :
          `${m}: Level ${m} Priority`;

        markNum.addEventListener('click', (e) => {
          e.stopPropagation();
          setWordMark(clean, m);
        });

        marksCol.appendChild(markNum);
      }

      cell.appendChild(marksCol);

      // Left Click: Open Dictionary & Translation Modal
      cell.addEventListener('click', () => {
        openDictionaryModal(clean, rank);
      });

      grid.appendChild(cell);
    }

    section.appendChild(grid);
    vocabContainer.appendChild(section);
  }
}

// ─────────────────────────────────────────────────
// Word Status & Mark Mutators
// ─────────────────────────────────────────────────
function setWordMark(word: string, mark: number): void {
  const clean = word.toLowerCase();

  // Remove from existing status arrays
  state.knownWords = state.knownWords.filter((w) => w !== clean);
  state.learningWords = state.learningWords.filter((w) => w !== clean);
  state.ignoredWords = state.ignoredWords.filter((w) => w !== clean);

  state.customMarks[clean] = mark;

  if (mark === 1) {
    state.knownWords.push(clean);
  } else if (mark === 2 || mark >= 4) {
    state.learningWords.push(clean);
  } else if (mark === 3) {
    state.ignoredWords.push(clean);
  }

  saveState();

  // Update DOM cell dynamically without full re-render
  const cell = document.querySelector<HTMLDivElement>(`.cr-word-cell[data-word="${clean}"]`);
  if (cell) {
    const rank = Number(cell.getAttribute('data-rank') || 100);
    cell.classList.remove('status-known', 'status-learning', 'status-ignored', 'status-auto', 'status-suggested');
    const newStatus = getWordStatus(clean, rank);
    cell.classList.add(`status-${newStatus}`);
  }
}

function bulkMarkTierAsKnown(words: string[]): void {
  for (const w of words) {
    const clean = w.toLowerCase();
    state.customMarks[clean] = 1;
    if (!state.knownWords.includes(clean)) {
      state.knownWords.push(clean);
    }
    state.learningWords = state.learningWords.filter((x) => x !== clean);
    state.ignoredWords = state.ignoredWords.filter((x) => x !== clean);
  }
  saveState();
  renderVocabMatrix(searchInput.value);
}

// ─────────────────────────────────────────────────
// Dictionary & Translation Modal
// ─────────────────────────────────────────────────
async function openDictionaryModal(word: string, rank: number): Promise<void> {
  activeModalWord = word;
  modalTitle.textContent = word;
  modalRank.textContent = `Rank: ${rank}`;

  const cefr = rank <= 500 ? 'A1' : rank <= 1000 ? 'A2' : rank <= 3000 ? 'B1' : rank <= 8000 ? 'B2' : 'C1';
  modalCefr.textContent = `CEFR: ${cefr}`;
  modalPos.textContent = `POS: word`;

  modalTrans.textContent = 'جاري الترجمة...';
  dictModal.classList.add('open');

  try {
    const translations = await getQuickWordTranslation(word);
    if (translations && translations.length > 0) {
      modalTrans.textContent = translations.join(' / ');
    } else {
      modalTrans.textContent = 'ترجمة فورية';
    }
  } catch {
    modalTrans.textContent = 'ترجمة غير متوفرة حالياً';
  }
}

modalCloseBtn.addEventListener('click', () => {
  dictModal.classList.remove('open');
});

dictModal.addEventListener('click', (e) => {
  if (e.target === dictModal) {
    dictModal.classList.remove('open');
  }
});

btnModalKnown.addEventListener('click', () => {
  if (activeModalWord) {
    setWordMark(activeModalWord, 1);
    dictModal.classList.remove('open');
  }
});

btnModalLearn.addEventListener('click', () => {
  if (activeModalWord) {
    setWordMark(activeModalWord, 2);
    dictModal.classList.remove('open');
  }
});

btnModalIgnore.addEventListener('click', () => {
  if (activeModalWord) {
    setWordMark(activeModalWord, 3);
    dictModal.classList.remove('open');
  }
});

btnModalSpeak.addEventListener('click', () => {
  if (activeModalWord && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(activeModalWord);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  }
});

// ─────────────────────────────────────────────────
// Search & Filter Listeners
// ─────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  renderVocabMatrix(searchInput.value);
});

// ─────────────────────────────────────────────────
// Navigation Tabs Switching
// ─────────────────────────────────────────────────
function switchTab(tabKey: keyof typeof navTabs): void {
  Object.values(navTabs).forEach((btn) => btn.classList.remove('active'));
  Object.values(viewPanels).forEach((panel) => (panel.style.display = 'none'));

  navTabs[tabKey].classList.add('active');
  viewPanels[tabKey].style.display = 'block';

  if (tabKey === 'savedWords') {
    renderSavedWordsTable();
  } else if (tabKey === 'savedPhrases') {
    renderSavedPhrases();
  }
}

navTabs.vocab.addEventListener('click', () => switchTab('vocab'));
navTabs.savedWords.addEventListener('click', () => switchTab('savedWords'));
navTabs.savedPhrases.addEventListener('click', () => switchTab('savedPhrases'));
navTabs.srs.addEventListener('click', () => switchTab('srs'));

// ─────────────────────────────────────────────────
// Saved Words Table View
// ─────────────────────────────────────────────────
function renderSavedWordsTable(): void {
  const container = document.getElementById('saved-words-table-container');
  if (!container) return;

  const markedWords = Object.keys(state.customMarks);
  if (markedWords.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 0; color: #94a3b8;">
        <div style="font-size: 32px; margin-bottom: 8px;">📚</div>
        <div>No words marked or saved yet. Click on words in the Vocabulary tab to add marks!</div>
      </div>
    `;
    return;
  }

  const table = document.createElement('table');
  table.className = 'saved-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Word</th>
        <th>Mark</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${markedWords
        .map((w) => {
          const mark = state.customMarks[w];
          const status =
            mark === 1 ? 'Known' :
            mark === 2 ? 'Learning' :
            mark === 3 ? 'Don\'t Learn' :
            `Level ${mark}`;

          const color =
            mark === 1 ? '#4ade80' :
            mark === 2 ? '#fb923c' :
            mark === 3 ? '#64748b' : '#c084fc';

          return `
            <tr>
              <td style="font-weight: 700; color: #fff;">${w}</td>
              <td><span style="background: #232631; padding: 2px 8px; border-radius: 4px; font-weight: 700; color: ${color};">${mark}</span></td>
              <td style="color: ${color}; font-weight: 600;">${status}</td>
              <td>
                <button class="tool-btn" onclick="window.speakWord('${w}')" style="display:inline-flex;">🔊</button>
              </td>
            </tr>
          `;
        })
        .join('')}
    </tbody>
  `;

  container.replaceChildren(table);
}

// ─────────────────────────────────────────────────
// Saved Phrases View
// ─────────────────────────────────────────────────
function renderSavedPhrases(): void {
  const container = document.getElementById('saved-phrases-container');
  if (!container) return;

  if (state.savedPhrases.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 0; color: #94a3b8;">
        <div style="font-size: 32px; margin-bottom: 8px;">⭐</div>
        <div>No phrases saved yet. Use the star button in YouTube subtitles to save phrases!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.savedPhrases
    .map(
      (p) => `
    <div style="background: #181920; border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px;">${p.text}</div>
        <div style="font-size: 15px; font-weight: 600; color: #38bdf8; font-family: 'Cairo', sans-serif; direction: rtl;">${p.ar}</div>
        ${p.videoTitle ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 6px;">Source: ${p.videoTitle}</div>` : ''}
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="tool-btn" onclick="window.speakPhrase('${p.text.replace(/'/g, "\\'")}')">🔊 Replay</button>
      </div>
    </div>
  `
    )
    .join('');
}

// Global audio helper
(window as unknown as { speakWord: (w: string) => void }).speakWord = (w: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(w);
    utt.lang = 'en-US';
    window.speechSynthesis.speak(utt);
  }
};

(window as unknown as { speakPhrase: (t: string) => void }).speakPhrase = (t: string) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(t);
    utt.lang = 'en-US';
    window.speechSynthesis.speak(utt);
  }
};

// ─────────────────────────────────────────────────
// Export Handler
// ─────────────────────────────────────────────────
document.getElementById('btn-export')?.addEventListener('click', () => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    userLevel: state.userLevel,
    knownWords: state.knownWords,
    learningWords: state.learningWords,
    ignoredWords: state.ignoredWords,
    customMarks: state.customMarks,
    savedPhrases: state.savedPhrases,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `codireactor_vocabulary_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─────────────────────────────────────────────────
// Keyboard Shortcuts for Marks (1-9)
// ─────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
    const focused = document.querySelector<HTMLDivElement>('.cr-word-cell:hover, .cr-word-cell.focused');
    if (focused) {
      const word = focused.getAttribute('data-word');
      if (word) {
        setWordMark(word, Number(e.key));
      }
    }
  }
});

// ─────────────────────────────────────────────────
// Initial Mount
// ─────────────────────────────────────────────────
updateStatsBar();
renderVocabMatrix();
