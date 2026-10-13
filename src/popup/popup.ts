// ─────────────────────────────────────────────────
// Popup Script: Full tools, Supabase sync, and settings
// ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const toggleLR = document.getElementById('toggle-lr') as HTMLInputElement | null;
  const toggleAP = document.getElementById('toggle-ap') as HTMLInputElement | null;
  const toggleColors = document.getElementById('toggle-colors') as HTMLInputElement | null;
  const btnSettings = document.getElementById('btn-open-settings') as HTMLButtonElement | null;
  const btnCatalog = document.getElementById('btn-catalog');
  const btnNotebook = document.getElementById('btn-notebook');
  const btnSRS = document.getElementById('btn-srs');
  const btnAria = document.getElementById('btn-aria');
  const userLevel = document.getElementById('user-level');
  const userEmail = document.getElementById('user-email');

  // Load preferences
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get(['showSubtitleOverlay', 'autoPause', 'showColors', 'userLevel', 'userEmail'], (res) => {
      if (toggleLR && res.showSubtitleOverlay !== undefined) {
        toggleLR.checked = Boolean(res.showSubtitleOverlay);
      }
      if (toggleAP && res.autoPause !== undefined) {
        toggleAP.checked = Boolean(res.autoPause);
      }
      if (toggleColors && res.showColors !== undefined) {
        toggleColors.checked = Boolean(res.showColors);
      }
      if (userLevel && res.userLevel) {
        userLevel.textContent = `CEFR ${res.userLevel}`;
      }
      if (userEmail && res.userEmail) {
        userEmail.textContent = res.userEmail;
      }
    });
  }

  function sendToActiveTab(type: string, payload: any = {}) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type, payload }).catch(() => {});
        }
      });
    }
  }

  // Dual Subtitles toggle
  toggleLR?.addEventListener('change', () => {
    const enabled = toggleLR.checked;
    sendToActiveTab('TOGGLE_OVERLAY', { enabled });
    chrome.storage?.sync?.set({ showSubtitleOverlay: enabled });
  });

  // Auto Pause toggle
  toggleAP?.addEventListener('change', () => {
    const enabled = toggleAP.checked;
    sendToActiveTab('TOGGLE_AUTO_PAUSE', { enabled });
    chrome.storage?.sync?.set({ autoPause: enabled });
  });

  // Word Colors toggle
  toggleColors?.addEventListener('change', () => {
    const enabled = toggleColors.checked;
    sendToActiveTab('TOGGLE_WORD_COLORS', { enabled });
    chrome.storage?.sync?.set({ showColors: enabled });
  });

  // Open Full Settings Modal in active tab
  btnSettings?.addEventListener('click', () => {
    sendToActiveTab('OPEN_SETTINGS_MODAL', {});
    window.close();
  });

  // Tools Navigation
  btnCatalog?.addEventListener('click', () => {
    sendToActiveTab('OPEN_HUB_PAGE', { page: 'catalog' });
    window.close();
  });

  btnNotebook?.addEventListener('click', () => {
    sendToActiveTab('OPEN_HUB_PAGE', { page: 'notebook' });
    window.close();
  });

  btnSRS?.addEventListener('click', () => {
    sendToActiveTab('OPEN_HUB_PAGE', { page: 'phrasepump' });
    window.close();
  });

  btnAria?.addEventListener('click', () => {
    sendToActiveTab('OPEN_HUB_PAGE', { page: 'aria' });
    window.close();
  });
});
