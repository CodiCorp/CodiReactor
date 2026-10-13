// ─────────────────────────────────────────────────
// Export Engine: Anki .apkg, CSV/TSV, JSON backup
// ─────────────────────────────────────────────────

import { SavedItem } from '../core/types';

/**
 * Export saved items as CSV for spreadsheet import.
 */
export function exportCSV(items: SavedItem[]): string {
  const headers = [
    'Word', 'Translation', 'Context (L2)', 'Context (L1)',
    'Phonetic', 'POS', 'Source', 'Date',
  ].join(',');

  const rows = items.map(item => {
    const fields = [
      escapeCSV(item.word),
      escapeCSV(item.translation),
      escapeCSV(item.sentenceTarget),
      escapeCSV(item.sentenceNative),
      escapeCSV(item.phonetic),
      escapeCSV(item.pos),
      escapeCSV(`${item.sourcePlatform}: ${item.sourceTitle}`),
      escapeCSV(new Date(item.dateAdded).toISOString()),
    ];
    return fields.join(',');
  });

  return [headers, ...rows].join('\n');
}

/**
 * Export saved items as TSV (tab-separated) for Anki text import.
 */
export function exportTSV(items: SavedItem[]): string {
  const rows = items.map(item => {
    const front = `<b>${item.word}</b> <i>(${item.pos})</i><br>${item.sentenceTarget}`;
    const back = `${item.translation}<br>${item.phonetic}<br>${item.sentenceNative}`;
    const tags = [item.sourcePlatform, item.colorTag].filter(Boolean).join(' ');
    return `${front}\t${back}\t${tags}`;
  });

  return rows.join('\n');
}

/**
 * Export full database as JSON backup for cross-browser migration.
 */
export function exportJSON(data: {
  items: SavedItem[];
  version: string;
  exportDate: number;
}): string {
  return JSON.stringify({
    format: 'codireactor-backup',
    version: data.version,
    exportDate: data.exportDate,
    itemCount: data.items.length,
    items: data.items,
  }, null, 2);
}

/**
 * Import from JSON backup.
 */
export function importJSON(json: string): {
  items: SavedItem[];
  version: string;
  exportDate: number;
} | null {
  try {
    const data = JSON.parse(json);
    if (data.format !== 'codireactor-backup') return null;
    return {
      items: data.items || [],
      version: data.version || '0.0.0',
      exportDate: data.exportDate || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Build Anki card HTML for front side.
 */
export function buildAnkiFront(item: SavedItem): string {
  return [
    `<div style="font-size:24px;font-weight:bold;margin-bottom:12px;">${escapeHTML(item.word)}</div>`,
    item.phonetic ? `<div style="font-size:14px;color:#888;margin-bottom:8px;">${escapeHTML(item.phonetic)}</div>` : '',
    item.pos ? `<div style="font-size:12px;color:#6366f1;text-transform:uppercase;margin-bottom:12px;">${escapeHTML(item.pos)}</div>` : '',
    `<div style="font-size:16px;color:#ccc;font-style:italic;border-top:1px solid #333;padding-top:10px;margin-top:8px;">"${escapeHTML(item.sentenceTarget)}"</div>`,
  ].filter(Boolean).join('\n');
}

/**
 * Build Anki card HTML for back side.
 */
export function buildAnkiBack(item: SavedItem): string {
  return [
    `<div style="font-size:20px;font-weight:bold;color:#4ade80;margin-bottom:8px;">${escapeHTML(item.translation)}</div>`,
    item.sentenceNative ? `<div style="font-size:14px;color:#aaa;margin-bottom:8px;">"${escapeHTML(item.sentenceNative)}"</div>` : '',
    `<hr style="border:none;border-top:1px solid #333;margin:12px 0;">`,
    `<div style="font-size:12px;color:#666;">Source: ${escapeHTML(item.sourceTitle)} (${escapeHTML(item.sourcePlatform)})</div>`,
  ].filter(Boolean).join('\n');
}

/**
 * Generate Anki import data (cards array for anki-apkg-export or AnkiConnect).
 */
export function generateAnkiCards(items: SavedItem[]): Array<{
  front: string;
  back: string;
  tags: string[];
}> {
  return items.map(item => ({
    front: buildAnkiFront(item),
    back: buildAnkiBack(item),
    tags: [
      item.sourcePlatform,
      item.colorTag !== 'default' ? item.colorTag : '',
      item.pos || '',
    ].filter(Boolean),
  }));
}

/**
 * Push cards to local Anki via AnkiConnect API.
 * Requires AnkiConnect add-on running on localhost:8765.
 */
export async function pushToAnkiConnect(
  items: SavedItem[],
  deckName: string = 'CodiReactor',
  modelName: string = 'Basic',
): Promise<{ success: number; failed: number; errors: string[] }> {
  const result = { success: 0, failed: 0, errors: [] as string[] };

  // First, ensure deck exists
  try {
    await fetch('http://localhost:8765', {
      method: 'POST',
      body: JSON.stringify({
        action: 'createDeck',
        version: 6,
        params: { deck: deckName },
      }),
    });
  } catch (err) {
    result.errors.push('Cannot connect to AnkiConnect. Is Anki running with the AnkiConnect add-on?');
    result.failed = items.length;
    return result;
  }

  // Add cards one at a time
  for (const item of items) {
    try {
      const response = await fetch('http://localhost:8765', {
        method: 'POST',
        body: JSON.stringify({
          action: 'addNote',
          version: 6,
          params: {
            note: {
              deckName,
              modelName,
              fields: {
                Front: buildAnkiFront(item),
                Back: buildAnkiBack(item),
              },
              tags: [item.sourcePlatform, item.colorTag].filter(Boolean),
            },
          },
        }),
      });

      const data = await response.json();
      if (data.error) {
        result.failed++;
        result.errors.push(`${item.word}: ${data.error}`);
      } else {
        result.success++;
      }
    } catch {
      result.failed++;
      result.errors.push(`${item.word}: Network error`);
    }
  }

  return result;
}

/**
 * Create a downloadable file blob.
 */
export function createDownloadBlob(content: string, mimeType: string): Blob {
  return new Blob([content], { type: mimeType });
}

/**
 * Trigger a browser file download.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ─────────────────────────────────────

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
