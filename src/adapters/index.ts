// ─────────────────────────────────────────────────
// Adapter Registry: Detects which platform the user
// is on and returns the correct adapter instance
// ─────────────────────────────────────────────────

import { IVideoPlatformAdapter } from './BasePlatformAdapter';
import { YouTubeAdapter } from './YouTubeAdapter';
import { NetflixAdapter } from './NetflixAdapter';
import { UdemyAdapter } from './UdemyAdapter';
import { CourseraAdapter } from './CourseraAdapter';
import { WebReaderAdapter } from './WebReaderAdapter';
import { GenericVideoAdapter } from './GenericVideoAdapter';

/**
 * Registry of all platform adapters in priority order.
 * First adapter whose detect() returns true wins.
 */
const ADAPTERS: Array<() => IVideoPlatformAdapter> = [
  () => new YouTubeAdapter(),
  () => new NetflixAdapter(),
  () => new UdemyAdapter(),
  () => new CourseraAdapter(),
  () => new WebReaderAdapter(),
  () => new GenericVideoAdapter(), // Fallback — always last
];

/**
 * Detect the current platform and return the appropriate adapter.
 * Returns null if no video-capable page is detected.
 */
export function detectPlatform(): IVideoPlatformAdapter | null {
  for (const createAdapter of ADAPTERS) {
    const adapter = createAdapter();
    if (adapter.detect()) {
      return adapter;
    }
  }
  return null;
}

/**
 * Get a specific adapter by platform ID.
 */
export function getAdapterById(platformId: string): IVideoPlatformAdapter | null {
  switch (platformId) {
    case 'youtube': return new YouTubeAdapter();
    case 'netflix': return new NetflixAdapter();
    case 'udemy': return new UdemyAdapter();
    case 'coursera': return new CourseraAdapter();
    case 'webreader': return new WebReaderAdapter();
    case 'generic': return new GenericVideoAdapter();
    default: return null;
  }
}
