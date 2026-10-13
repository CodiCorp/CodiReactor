// ─────────────────────────────────────────────────
// First-Run Native Language Selector Modal
// Matches Reference Screenshot 093213.png
// ─────────────────────────────────────────────────

export interface FirstRunModalConfig {
  defaultLanguage?: string;
  onConfirm: (language: string, autoHideBar: boolean) => void;
  onClose?: () => void;
}

export class FirstRunModal {
  private backdrop: HTMLElement | null = null;
  private config: FirstRunModalConfig;

  constructor(config: FirstRunModalConfig) {
    this.config = {
      defaultLanguage: 'Arabic',
      ...config,
    };
  }

  open(): void {
    if (this.backdrop) return;

    // Dimmed Backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'cr-first-run-backdrop';
    this.backdrop.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      background: rgba(0, 0, 0, 0.72) !important;
      backdrop-filter: blur(4px) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: 'Roboto', 'Segoe UI', -apple-system, sans-serif !important;
      user-select: none !important;
    `;

    // Modal Card (Screenshot 093213.png)
    const card = document.createElement('div');
    card.className = 'cr-first-run-card';
    card.style.cssText = `
      background: #232323 !important;
      color: #ffffff !important;
      width: 440px !important;
      max-width: 90vw !important;
      border-radius: 8px !important;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7) !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      animation: cr-fade-zoom 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    `;

    // 1. Header: "Language Reactor" / "CodiReactor" + Close "✖"
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 14px 18px !important;
      border-bottom: 1px solid #2e2e2e !important;
    `;

    const title = document.createElement('span');
    title.style.cssText = `
      font-size: 15px !important;
      font-weight: 600 !important;
      color: #f1f1f1 !important;
    `;
    title.textContent = 'CodiReactor';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖';
    closeBtn.setAttribute('title', 'Close');
    closeBtn.style.cssText = `
      background: none !important;
      border: none !important;
      color: #999999 !important;
      font-size: 16px !important;
      cursor: pointer !important;
      padding: 0 !important;
      line-height: 1 !important;
    `;
    closeBtn.addEventListener('click', () => {
      this.close();
      this.config.onClose?.();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // 2. Content Area
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 22px 24px 18px 24px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      text-align: center !important;
    `;

    const promptText = document.createElement('div');
    promptText.style.cssText = `
      font-size: 14.5px !important;
      color: #f1f1f1 !important;
      margin-bottom: 14px !important;
    `;
    promptText.textContent = 'Please select your native language:';

    // Dropdown Select
    const select = document.createElement('select');
    select.style.cssText = `
      width: 220px !important;
      padding: 8px 12px !important;
      background: #181818 !important;
      border: 1px solid #3e3e3e !important;
      border-radius: 4px !important;
      color: #ffffff !important;
      font-size: 14px !important;
      outline: none !important;
      cursor: pointer !important;
      margin-bottom: 22px !important;
      text-align: center !important;
    `;

    const languages = [
      { code: 'ar', name: 'Arabic' },
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'tr', name: 'Turkish' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ru', name: 'Russian' },
      { code: 'it', name: 'Italian' },
    ];

    languages.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.name;
      if (lang.name === this.config.defaultLanguage || lang.code === 'ar') {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    // Radio Options (Screenshot 093213.png)
    const optionsWrapper = document.createElement('div');
    optionsWrapper.style.cssText = `
      width: 100% !important;
      text-align: left !important;
      margin-bottom: 22px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      font-size: 13.5px !important;
    `;

    // Radio 1: Auto-hide YouTube playback bar
    const radio1Label = document.createElement('label');
    radio1Label.style.cssText = `
      display: flex !important;
      align-items: center !important;
      cursor: pointer !important;
      gap: 8px !important;
      color: #f1f1f1 !important;
    `;
    const radio1 = document.createElement('input');
    radio1.type = 'radio';
    radio1.name = 'cr_ui_mode';
    radio1.checked = true;
    radio1.style.accentColor = '#0284c7';
    radio1Label.appendChild(radio1);
    radio1Label.appendChild(document.createTextNode('Auto-hide YouTube playback bar (recommended)'));

    // Radio 2: Keep interface unchanged
    const radio2Label = document.createElement('label');
    radio2Label.style.cssText = `
      display: flex !important;
      align-items: center !important;
      cursor: pointer !important;
      gap: 8px !important;
      color: #f1f1f1 !important;
    `;
    const radio2 = document.createElement('input');
    radio2.type = 'radio';
    radio2.name = 'cr_ui_mode';
    radio2.checked = false;
    radio2.style.accentColor = '#0284c7';
    radio2Label.appendChild(radio2);
    radio2Label.appendChild(document.createTextNode('Keep interface unchanged'));

    optionsWrapper.appendChild(radio1Label);
    optionsWrapper.appendChild(radio2Label);

    // Blue [ OK ] Button
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = `
      background: #0284c7 !important;
      border: none !important;
      border-radius: 4px !important;
      color: #ffffff !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      padding: 8px 32px !important;
      cursor: pointer !important;
      transition: background 0.15s ease !important;
      outline: none !important;
    `;
    okBtn.addEventListener('mouseenter', () => { okBtn.style.background = '#0369a1'; });
    okBtn.addEventListener('mouseleave', () => { okBtn.style.background = '#0284c7'; });
    okBtn.addEventListener('click', () => {
      const selectedLang = select.value;
      const autoHide = radio1.checked;
      this.close();
      this.config.onConfirm(selectedLang, autoHide);
    });

    body.appendChild(promptText);
    body.appendChild(select);
    body.appendChild(optionsWrapper);
    body.appendChild(okBtn);

    card.appendChild(header);
    card.appendChild(body);
    this.backdrop.appendChild(card);
    document.body.appendChild(this.backdrop);
  }

  close(): void {
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
  }
}
