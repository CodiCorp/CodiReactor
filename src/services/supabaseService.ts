// ─────────────────────────────────────────────────
// Supabase Service: Cloud Database & Sync Engine
// Persists vocabulary, CEFR levels, and SRS reviews
// ─────────────────────────────────────────────────

import { SavedItem, TokenStatus } from '../core/types';
import { SM2Result } from '../srs/phrasePump';

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authToken?: string;
  userId?: string;
}

export interface UserProfileCloud {
  id: string;
  email?: string;
  target_language: string;
  native_language: string;
  cefr_level: string;
  known_words_count: number;
  learning_words_count: number;
  settings: Record<string, any>;
}

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  supabaseUrl: 'https://gzbsoomvlikjjxirzjfm.supabase.co',
  supabaseAnonKey: 'sb_publishable_1WqDgQIy3KPs4w6B-YHkTA_tmnFnCn0',
  authToken: '',
  userId: '',
};

export class SupabaseService {
  private config: SupabaseConfig;

  constructor(config: Partial<SupabaseConfig> = {}) {
    this.config = {
      supabaseUrl: config.supabaseUrl !== undefined ? config.supabaseUrl : DEFAULT_SUPABASE_CONFIG.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey !== undefined ? config.supabaseAnonKey : DEFAULT_SUPABASE_CONFIG.supabaseAnonKey,
      authToken: config.authToken || '',
      userId: config.userId || '',
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.supabaseUrl && this.config.supabaseAnonKey);
  }

  updateConfig(updates: Partial<SupabaseConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'apikey': this.config.supabaseAnonKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    return headers;
  }

  /**
   * Fetch all saved vocabulary for the current user.
   */
  async fetchVocabulary(): Promise<SavedItem[]> {
    if (!this.isConfigured() || !this.config.userId) return [];

    try {
      const endpoint = `${this.config.supabaseUrl}/rest/v1/saved_vocabulary?user_id=eq.${this.config.userId}&order=created_at.desc`;
      const res = await fetch(endpoint, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        console.error('[Supabase] Failed to fetch vocabulary:', res.statusText);
        return [];
      }

      const rows = await res.json();
      return rows.map((r: any): SavedItem => ({
        id: r.id,
        word: r.word,
        cleanWord: r.clean_word,
        lemma: r.lemma || '',
        translation: r.translation || '',
        phonetic: r.phonetic || '',
        pos: r.pos || '',
        sentenceTarget: r.sentence_target || '',
        sentenceNative: r.sentence_native || '',
        sourcePlatform: r.source_platform || 'youtube',
        sourceUrl: r.source_url || '',
        sourceTitle: r.source_title || '',
        timestampMs: Number(r.timestamp_ms || 0),
        dateAdded: new Date(r.created_at).getTime(),
        colorTag: r.color_tag || 'default',
        status: (r.status as TokenStatus) || 'learning',
        srsInterval: r.srs_interval || 0,
        srsRepetitions: r.srs_repetitions || 0,
        srsEaseFactor: Number(r.srs_ease_factor || 2.5),
        srsDueDate: new Date(r.srs_due_date).getTime(),
      }));
    } catch (err) {
      console.warn('[Supabase] Offline or network error fetching vocabulary:', err);
      return [];
    }
  }

  /**
   * Save or update a vocabulary item in Supabase.
   */
  async saveItem(item: SavedItem): Promise<boolean> {
    if (!this.isConfigured() || !this.config.userId) return false;

    const row = {
      user_id: this.config.userId,
      word: item.word,
      clean_word: item.cleanWord,
      lemma: item.lemma,
      translation: item.translation,
      phonetic: item.phonetic,
      pos: item.pos,
      sentence_target: item.sentenceTarget,
      sentence_native: item.sentenceNative,
      source_platform: item.sourcePlatform,
      source_url: item.sourceUrl,
      source_title: item.sourceTitle,
      timestamp_ms: item.timestampMs,
      color_tag: item.colorTag,
      status: item.status,
      srs_interval: item.srsInterval,
      srs_repetitions: item.srsRepetitions,
      srs_ease_factor: item.srsEaseFactor,
      srs_due_date: new Date(item.srsDueDate).toISOString(),
    };

    try {
      const endpoint = `${this.config.supabaseUrl}/rest/v1/saved_vocabulary`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(row),
      });

      return res.ok;
    } catch (err) {
      console.warn('[Supabase] Offline or failed to save vocabulary:', err);
      return false;
    }
  }

  /**
   * Update the status of a word (e.g. 'known' | 'learning' | 'ignored').
   */
  async updateStatus(id: string, status: TokenStatus): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      const endpoint = `${this.config.supabaseUrl}/rest/v1/saved_vocabulary?id=eq.${id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });

      return res.ok;
    } catch (err) {
      console.warn('[Supabase] Failed to update status:', err);
      return false;
    }
  }

  /**
   * Record an SM-2 SRS review rating in Supabase.
   */
  async recordReview(id: string, quality: number, sm2Res: SM2Result): Promise<boolean> {
    if (!this.isConfigured()) return false;

    try {
      // 1. Update vocabulary card SRS attributes
      const vocabEndpoint = `${this.config.supabaseUrl}/rest/v1/saved_vocabulary?id=eq.${id}`;
      await fetch(vocabEndpoint, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({
          srs_interval: sm2Res.interval,
          srs_repetitions: sm2Res.repetitions,
          srs_ease_factor: sm2Res.easeFactor,
          srs_due_date: new Date(sm2Res.dueDate).toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      // 2. Insert into review history log
      if (this.config.userId) {
        const logEndpoint = `${this.config.supabaseUrl}/rest/v1/srs_reviews_log`;
        await fetch(logEndpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            user_id: this.config.userId,
            vocab_id: id,
            quality,
            new_interval: sm2Res.interval,
          }),
        });
      }

      return true;
    } catch (err) {
      console.warn('[Supabase] Failed to record SRS review:', err);
      return false;
    }
  }

  /**
   * Get user profile with current CEFR level and settings.
   */
  async getProfile(): Promise<UserProfileCloud | null> {
    if (!this.isConfigured() || !this.config.userId) return null;

    try {
      const endpoint = `${this.config.supabaseUrl}/rest/v1/profiles?id=eq.${this.config.userId}&select=*`;
      const res = await fetch(endpoint, {
        headers: this.getHeaders(),
      });

      if (!res.ok) return null;
      const rows = await res.json();
      return rows[0] || null;
    } catch (err) {
      console.warn('[Supabase] Failed to fetch profile:', err);
      return null;
    }
  }

  /**
   * Update user level or settings in Supabase.
   */
  async updateProfile(updates: Partial<UserProfileCloud>): Promise<boolean> {
    if (!this.isConfigured() || !this.config.userId) return false;

    try {
      const endpoint = `${this.config.supabaseUrl}/rest/v1/profiles?id=eq.${this.config.userId}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });

      return res.ok;
    } catch (err) {
      console.warn('[Supabase] Failed to update profile:', err);
      return false;
    }
  }
}
