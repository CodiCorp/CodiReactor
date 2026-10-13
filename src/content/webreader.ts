// ─────────────────────────────────────────────────
// Web Reader Content Script Bootstrap
// Activates immersion text mode on web articles
// ─────────────────────────────────────────────────

import { ContentOrchestrator } from '../ui/ContentOrchestrator';

export async function bootstrapWebReader(): Promise<ContentOrchestrator> {
  // Mark document body as reader-active so WebReaderAdapter detects it
  document.body.setAttribute('data-codireactor-reader', 'true');

  const orchestrator = new ContentOrchestrator();
  await orchestrator.boot();
  return orchestrator;
}

// Auto-boot if triggered via query param or extension message
if (typeof window !== 'undefined' && window.location.search.includes('codireactor_reader=1')) {
  bootstrapWebReader().catch(err => {
    console.error('[CodiReactor] Web Reader boot failed:', err);
  });
}
