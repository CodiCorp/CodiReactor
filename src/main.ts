// ─────────────────────────────────────────────────
// CodiReactor Web Hub Main Entrypoint
// ─────────────────────────────────────────────────

import { SupabaseService } from './services/supabaseService';

console.log('[CodiReactor Hub] Initializing web portal...');

const supabase = new SupabaseService();
console.log('[CodiReactor Hub] Supabase Cloud configured:', supabase.isConfigured());

// Navigation tabs
const tabs = document.querySelectorAll<HTMLButtonElement>('.nav-btn');
tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
  });
});
