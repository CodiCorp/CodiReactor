// Udemy content script — boots the orchestrator
import { ContentOrchestrator } from '../ui/ContentOrchestrator';

const orchestrator = new ContentOrchestrator();
orchestrator.boot().catch(err => {
  console.error('[CodiReactor] Udemy boot failed:', err);
});
