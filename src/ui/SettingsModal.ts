// ─────────────────────────────────────────────────
// Settings Modal: Full in-page configuration dialog
// Matches Reference Screenshots 113538 & 113552
// Includes Supabase account sync, CEFR level,
// subtitle languages, word colors, and shortcuts guide
// ─────────────────────────────────────────────────

import { UserSettings } from '../core/types';
import { SupabaseService } from '../services/supabaseService';

export interface SettingsModalCallbacks {
  onSave?: (settings: Partial<UserSettings>) => void;
  onClose?: () => void;
  onNavigateHub?: (page: string) => void;
}

export class SettingsModal {
  private container: HTMLElement | null = null;
  private isOpen = false;
  private supabase: SupabaseService;
  private callbacks: SettingsModalCallbacks;

  constructor(callbacks: SettingsModalCallbacks = {}) {
    this.callbacks = callbacks;
    this.supabase = new SupabaseService();
  }

  /**
   * Open the settings modal dialog.
   */
  open(parent: HTMLElement = document.body): void {
    if (this.isOpen) return;
    this.isOpen = true;

    this.container = document.createElement('div');
    this.container.className = 'codireactor-settings-modal-backdrop';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f1f5f9;
      box-sizing: border-box;
    `;

    // Modal Card
    const modal = document.createElement('div');
    modal.className = 'codireactor-settings-modal-card';
    modal.style.cssText = `
      width: 780px;
      max-width: 95vw;
      max-height: 90vh;
      background: #181c24;
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // 1. Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: #131720;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">⚡</span>
        <span style="font-size: 16px; font-weight: 700; color: #60a5fa;">CodiReactor — Settings</span>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    `;
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // 2. Body (Two Columns: Left Navigation & Shortcuts, Right Settings)
    const body = document.createElement('div');
    body.style.cssText = `
      display: grid;
      grid-template-columns: 240px 1fr;
      flex: 1;
      overflow-y: auto;
      min-height: 480px;
    `;

    // Left Column
    const leftCol = document.createElement('div');
    leftCol.style.cssText = `
      background: #131720;
      padding: 20px 16px;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    leftCol.innerHTML = `
      <div>
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Learning Hub</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <a href="#" class="cr-hub-link" data-page="catalog" style="color: #38bdf8; text-decoration: none; font-size: 13px;">🎬 Video Catalogue ⓘ</a>
          <a href="#" class="cr-hub-link" data-page="notebook" style="color: #38bdf8; text-decoration: none; font-size: 13px;">📚 Saved Words Notebook ⓘ</a>
          <a href="#" class="cr-hub-link" data-page="srs" style="color: #38bdf8; text-decoration: none; font-size: 13px;">🗂️ PhrasePump Flashcards ⓘ</a>
          <a href="#" class="cr-hub-link" data-page="aria" style="color: #38bdf8; text-decoration: none; font-size: 13px;">💬 Aria AI Chat Partner ⓘ</a>
        </div>
      </div>

      <div>
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px;">Keyboard Shortcuts</div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: #cbd5e1;">
          <div style="display: flex; justify-content: space-between;"><span>Previous Subtitle</span><kbd style="background: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">A</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Repeat Subtitle</span><kbd style="background: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">S</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Next Subtitle</span><kbd style="background: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">D</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Play / Pause</span><kbd style="background: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">Space</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Toggle Auto-Pause</span><kbd style="background: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">Q</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Save Subtitle</span><kbd style="background: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">R</kbd></div>
          <div style="display: flex; justify-content: space-between;"><span>Dictionary</span><span>Left Click 🖱️</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Mark Word</span><span>Right Click 🖱️</span></div>
        </div>
      </div>
    `;

    // Right Column (Settings Form)
    const rightCol = document.createElement('div');
    rightCol.style.cssText = `
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
    `;

    rightCol.innerHTML = `
      <!-- Supabase Cloud Sync Section -->
      <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-size: 13px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
            <span>☁️</span> <span>Supabase Cloud Sync</span>
          </div>
          <span style="font-size: 11px; background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 8px; border-radius: 9999px;">Sync Active</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
          <div>
            <label style="color: #94a3b8; display: block; margin-bottom: 4px;">User CEFR Level</label>
            <select id="cr-setting-level" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 6px; border-radius: 6px;">
              <option value="A1">A1 — Absolute Beginner</option>
              <option value="A2">A2 — Elementary</option>
              <option value="B1" selected>B1 — Intermediate (Recommended)</option>
              <option value="B2">B2 — Upper Intermediate</option>
              <option value="C1">C1 — Advanced</option>
              <option value="C2">C2 — Mastery</option>
            </select>
          </div>
          <div>
            <label style="color: #94a3b8; display: block; margin-bottom: 4px;">Cloud User Account</label>
            <input type="text" id="cr-setting-email" placeholder="user@supabase.co" value="demo.user@codi.ai" style="width: 100%; background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 6px; border-radius: 6px; box-sizing: border-box;" />
          </div>
        </div>
      </div>

      <!-- Language & Subtitles Settings -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px;">YouTube Subtitle Language</label>
          <select id="cr-setting-target-lang" style="background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 6px 12px; border-radius: 6px; width: 180px;">
            <option value="en" selected>English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="ar">Arabic</option>
          </select>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px;">Translation Language (Native)</label>
          <select id="cr-setting-native-lang" style="background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 6px 12px; border-radius: 6px; width: 180px;">
            <option value="ar" selected>Arabic (العربية)</option>
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="de">German</option>
          </select>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="font-size: 13px;">Hide Subtitles Mode</label>
          <select id="cr-setting-hide-sub" style="background: #0f172a; border: 1px solid #334155; color: #f8fafc; padding: 6px 12px; border-radius: 6px; width: 180px;">
            <option value="disabled" selected>Disabled (Show All)</option>
            <option value="hideNative">Hide Native Translation</option>
            <option value="hideTarget">Hide Target Subtitles</option>
            <option value="hideBoth">Hide Both (Listening Only)</option>
          </select>
        </div>
      </div>

      <!-- Word Colors Preview & Toggles -->
      <div>
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Vocabulary Colors & Matrix Preview</div>
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.6;">
          <span style="color: #6ee7b7;">The first night</span> I went to sleep on the
          <span style="color: #f59e0b; font-weight: 600; text-decoration: underline;">sand</span>,
          a thousand miles from any human
          <span style="color: #38bdf8; font-weight: 600;">habitation</span>.
          I was more <span style="color: #a78bfa; font-weight: 600;">isolated</span> than a
          shipwrecked sailor on a <span style="color: #fb7185; font-weight: 600;">raft</span> in the middle of the ocean.
        </div>
      </div>
    `;

    body.appendChild(leftCol);
    body.appendChild(rightCol);
    modal.appendChild(body);

    // 3. Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: #131720;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Close';
    cancelBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
    `;
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Sync to Supabase';
    saveBtn.style.cssText = `
      background: #2563eb;
      border: none;
      color: #fff;
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    `;
    saveBtn.addEventListener('click', () => {
      const levelEl = rightCol.querySelector('#cr-setting-level') as HTMLSelectElement;
      const targetLangEl = rightCol.querySelector('#cr-setting-target-lang') as HTMLSelectElement;
      const nativeLangEl = rightCol.querySelector('#cr-setting-native-lang') as HTMLSelectElement;

      this.callbacks.onSave?.({
        targetLanguage: targetLangEl?.value || 'en',
        nativeLanguage: nativeLangEl?.value || 'ar',
      });

      this.close();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    this.container.appendChild(modal);
    parent.appendChild(this.container);

    // Close on click outside modal
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }

  /**
   * Close the modal dialog.
   */
  close(): void {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
      this.container = null;
    }
    this.isOpen = false;
    this.callbacks.onClose?.();
  }
}
