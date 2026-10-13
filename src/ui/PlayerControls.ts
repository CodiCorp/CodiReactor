// ─────────────────────────────────────────────────
// Player Controls: Native YouTube control bar injection
// Matches Reference Screenshot 115856: [ (CR logo) ON ⚙️ ] & AP
// ─────────────────────────────────────────────────

import { ControlElements } from '../adapters/BasePlatformAdapter';
import { SettingsModal } from './SettingsModal';

export interface PlayerControlsConfig {
  onToggle: (enabled: boolean) => void;
  onAutoPause: (enabled: boolean) => void;
  onOpenSettings?: () => void;
  initialLRState?: boolean;
  initialAPState?: boolean;
  coveragePercent?: number;
}

export function buildHostPlayerControls(config: PlayerControlsConfig): ControlElements {
  let isEnabled = config.initialLRState ?? true;
  let isAutoPause = config.initialAPState ?? false;

  // 1. Unified Control Pill [ (CR icon) ON ⚙️ ]
  const pillWrapper = document.createElement('div');
  pillWrapper.className = 'codireactor-control-pill';
  pillWrapper.setAttribute('title', 'CodiReactor Language Immersion');
  pillWrapper.style.cssText = `
    display: inline-flex !important;
    align-items: center !important;
    background: rgba(30, 27, 46, 0.92) !important;
    border: 1px solid rgba(168, 85, 247, 0.5) !important;
    border-radius: 9999px !important;
    padding: 2px 8px 2px 3px !important;
    height: 26px !important;
    margin: 0 4px !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
    user-select: none !important;
    vertical-align: middle !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
    box-sizing: border-box !important;
    flex-shrink: 0 !important;
  `;

  // Purple Circle Logo (CR / LR)
  const logoCircle = document.createElement('div');
  logoCircle.className = 'cr-pill-logo';
  logoCircle.style.cssText = `
    width: 20px !important;
    height: 20px !important;
    min-width: 20px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%) !important;
    color: #ffffff !important;
    font-weight: 800 !important;
    font-size: 10px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
    box-sizing: border-box !important;
    line-height: 1 !important;
  `;
  logoCircle.textContent = 'CR';

  // ON / OFF text label
  const statusLabel = document.createElement('span');
  statusLabel.className = 'cr-pill-status';
  statusLabel.style.cssText = `
    font-size: 11px !important;
    font-weight: 700 !important;
    color: ${isEnabled ? '#c084fc' : '#94a3b8'} !important;
    margin: 0 4px !important;
    cursor: pointer !important;
    line-height: 1 !important;
    user-select: none !important;
  `;
  statusLabel.textContent = isEnabled ? 'ON' : 'OFF';

  // Toggle Action
  const toggleHandler = (e: Event) => {
    e.stopPropagation();
    isEnabled = !isEnabled;
    statusLabel.textContent = isEnabled ? 'ON' : 'OFF';
    statusLabel.style.color = isEnabled ? '#c084fc' : '#94a3b8';
    pillWrapper.style.borderColor = isEnabled ? 'rgba(168, 85, 247, 0.5)' : 'rgba(255, 255, 255, 0.2)';
    config.onToggle(isEnabled);
  };
  logoCircle.addEventListener('click', toggleHandler);
  statusLabel.addEventListener('click', toggleHandler);

  // Settings Gear Icon ⚙️
  const gearBtn = document.createElement('button');
  gearBtn.className = 'cr-pill-gear';
  gearBtn.setAttribute('title', 'CodiReactor Settings');
  gearBtn.style.cssText = `
    background: none !important;
    border: none !important;
    color: #d8b4fe !important;
    font-size: 13px !important;
    cursor: pointer !important;
    padding: 0 2px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: transform 0.2s ease !important;
    outline: none !important;
    line-height: 1 !important;
    box-sizing: border-box !important;
  `;
  gearBtn.textContent = '⚙️';
  gearBtn.addEventListener('mouseenter', () => {
    gearBtn.style.transform = 'rotate(30deg)';
  });
  gearBtn.addEventListener('mouseleave', () => {
    gearBtn.style.transform = 'rotate(0deg)';
  });
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (config.onOpenSettings) {
      config.onOpenSettings();
    } else {
      new SettingsModal().open();
    }
  });

  pillWrapper.appendChild(logoCircle);
  pillWrapper.appendChild(statusLabel);
  pillWrapper.appendChild(gearBtn);

  // 2. AP (Auto-Pause) Switch Widget matching Screenshot 182202.png
  const apContainer = document.createElement('div');
  apContainer.className = 'ytp-button codireactor-ap-widget';
  apContainer.setAttribute('title', 'Auto-Pause after each subtitle (Shortcut: Q)');
  apContainer.style.cssText = `
    display: inline-flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    margin: 0 4px !important;
    user-select: none !important;
    vertical-align: middle !important;
    flex-shrink: 0 !important;
    line-height: 1 !important;
  `;

  // Oval toggle track
  const toggleTrack = document.createElement('div');
  toggleTrack.className = 'cr-ap-track';
  toggleTrack.style.cssText = `
    width: 26px !important;
    height: 13px !important;
    border-radius: 9999px !important;
    background: ${isAutoPause ? '#a855f7' : 'rgba(255, 255, 255, 0.35)'} !important;
    position: relative !important;
    transition: background 0.2s ease !important;
    box-sizing: border-box !important;
  `;

  // Circular sliding thumb
  const toggleThumb = document.createElement('div');
  toggleThumb.className = 'cr-ap-thumb';
  toggleThumb.style.cssText = `
    width: 11px !important;
    height: 11px !important;
    border-radius: 50% !important;
    background: #ffffff !important;
    position: absolute !important;
    top: 1px !important;
    left: ${isAutoPause ? '14px' : '1px'} !important;
    transition: left 0.15s ease !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
  `;
  toggleTrack.appendChild(toggleThumb);

  // "AP" Label
  const apLabel = document.createElement('span');
  apLabel.className = 'cr-ap-label';
  apLabel.style.cssText = `
    font-size: 9.5px !important;
    font-weight: 700 !important;
    color: ${isAutoPause ? '#c084fc' : '#e2e8f0'} !important;
    margin-top: 1px !important;
    letter-spacing: 0.02em !important;
  `;
  apLabel.textContent = 'AP';

  // Double chevrons ^ v
  const chevrons = document.createElement('div');
  chevrons.className = 'cr-ap-chevrons';
  chevrons.style.cssText = `
    font-size: 7px !important;
    line-height: 6px !important;
    color: rgba(255, 255, 255, 0.6) !important;
    text-align: center !important;
    margin-top: -1px !important;
  `;
  const topChev = document.createElement('div');
  topChev.textContent = '▲';
  const botChev = document.createElement('div');
  botChev.textContent = '▼';
  chevrons.appendChild(topChev);
  chevrons.appendChild(botChev);

  apContainer.appendChild(toggleTrack);
  apContainer.appendChild(apLabel);
  apContainer.appendChild(chevrons);

  apContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    isAutoPause = !isAutoPause;
    toggleTrack.style.background = isAutoPause ? '#a855f7' : 'rgba(255, 255, 255, 0.35)';
    toggleThumb.style.left = isAutoPause ? '14px' : '1px';
    apLabel.style.color = isAutoPause ? '#c084fc' : '#e2e8f0';
    config.onAutoPause(isAutoPause);
  });

  return {
    toggleButton: pillWrapper,
    autoPauseButton: apContainer,
    statusBadge: undefined,
  };
}
