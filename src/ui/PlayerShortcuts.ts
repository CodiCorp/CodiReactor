// ─────────────────────────────────────────────────
// Keyboard Shortcut Engine: Player-level hotkeys
// Only active when user is NOT typing in an input
// ─────────────────────────────────────────────────

export interface ShortcutCallbacks {
  seekToPrevCue: () => void;
  replayCurrentCue: () => void;
  seekToNextCue: () => void;
  togglePlayPause: () => void;
  toggleAutoPause: () => void;
  saveCurrentSubtitle: () => void;
  revealMaskedText: () => void;
  decreasePlaybackRate: () => void;
  increasePlaybackRate: () => void;
  toggleOverlay: () => void;
  toggleTranscript: () => void;
}

/**
 * Returns true if the event target is an editable element.
 */
function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Player shortcut engine that binds keyboard shortcuts to player actions.
 */
export class PlayerShortcutEngine {
  private callbacks: ShortcutCallbacks;
  private handler: ((e: KeyboardEvent) => void) | null = null;
  private autoPause = false;

  constructor(callbacks: ShortcutCallbacks) {
    this.callbacks = callbacks;
  }

  /** Start listening for keyboard shortcuts */
  enable(): void {
    if (this.handler) return;

    this.handler = (e: KeyboardEvent) => {
      // Don't intercept when user is typing
      if (isEditableElement(e.target)) return;

      switch (e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
          this.callbacks.seekToPrevCue();
          e.preventDefault();
          break;

        case 's':
        case 'arrowdown':
          this.callbacks.replayCurrentCue();
          e.preventDefault();
          break;

        case 'd':
        case 'arrowright':
          this.callbacks.seekToNextCue();
          e.preventDefault();
          break;

        case ' ':
          this.callbacks.togglePlayPause();
          e.preventDefault();
          break;

        case 'q':
          this.callbacks.toggleAutoPause();
          e.preventDefault();
          break;

        case 'r':
          this.callbacks.saveCurrentSubtitle();
          e.preventDefault();
          break;

        case 'e':
          this.callbacks.revealMaskedText();
          e.preventDefault();
          break;

        case '1':
          this.callbacks.decreasePlaybackRate();
          e.preventDefault();
          break;

        case '2':
          this.callbacks.increasePlaybackRate();
          e.preventDefault();
          break;

        case 'l':
          this.callbacks.toggleOverlay();
          e.preventDefault();
          break;

        case 't':
          this.callbacks.toggleTranscript();
          e.preventDefault();
          break;
      }
    };

    document.addEventListener('keydown', this.handler, { capture: true });
  }

  /** Stop listening for keyboard shortcuts */
  disable(): void {
    if (this.handler) {
      document.removeEventListener('keydown', this.handler, { capture: true });
      this.handler = null;
    }
  }

  /** Clean up */
  destroy(): void {
    this.disable();
  }
}
