// ─────────────────────────────────────────────────
// Tests: Supabase Cloud Service
// ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from '../src/services/supabaseService';
import { SavedItem } from '../src/core/types';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    service = new SupabaseService({
      supabaseUrl: 'https://xyzcompany.supabase.co',
      supabaseAnonKey: 'test-anon-key',
      userId: 'user-uuid-123',
      authToken: 'jwt-token-abc',
    });

    vi.restoreAllMocks();
  });

  it('checks if configured correctly', () => {
    expect(service.isConfigured()).toBe(true);

    const empty = new SupabaseService({ supabaseUrl: '', supabaseAnonKey: '' });
    expect(empty.isConfigured()).toBe(false);
  });

  it('fetches vocabulary from Supabase REST endpoint', async () => {
    const mockData = [
      {
        id: 'vocab-1',
        word: 'eloquent',
        clean_word: 'eloquent',
        lemma: 'eloquent',
        translation: 'fluent or persuasive in speaking or writing',
        sentence_target: 'He was an eloquent speaker.',
        source_platform: 'youtube',
        status: 'learning',
        srs_interval: 1,
        srs_repetitions: 1,
        srs_ease_factor: 2.5,
        srs_due_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const items = await service.fetchVocabulary();
    expect(items).toHaveLength(1);
    expect(items[0].word).toBe('eloquent');
    expect(items[0].status).toBe('learning');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('saved_vocabulary?user_id=eq.user-uuid-123'),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'test-anon-key',
          Authorization: 'Bearer jwt-token-abc',
        }),
      })
    );
  });

  it('saves vocabulary item to Supabase', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    const sampleItem: SavedItem = {
      id: 'vocab-1',
      word: 'resilience',
      cleanWord: 'resilience',
      lemma: 'resilience',
      translation: 'the capacity to recover quickly from difficulties',
      phonetic: '',
      pos: 'noun',
      sentenceTarget: 'Emotional resilience is important.',
      sentenceNative: 'المرونة العاطفية مهمة.',
      sourcePlatform: 'youtube',
      sourceUrl: '',
      sourceTitle: '',
      timestampMs: 0,
      dateAdded: Date.now(),
      colorTag: 'mindset',
      status: 'learning',
      srsInterval: 0,
      srsRepetitions: 0,
      srsEaseFactor: 2.5,
      srsDueDate: Date.now(),
    };

    const success = await service.saveItem(sampleItem);
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://xyzcompany.supabase.co/rest/v1/saved_vocabulary',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('updates word status in Supabase', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    const success = await service.updateStatus('vocab-1', 'known');
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('saved_vocabulary?id=eq.vocab-1'),
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  it('records SRS review to card and history log', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    const success = await service.recordReview('vocab-1', 4, {
      interval: 6,
      repetitions: 2,
      easeFactor: 2.6,
      dueDate: Date.now() + 6 * 86400000,
    });

    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2); // 1 patch card + 1 insert log
  });

  it('fetches user profile and CEFR level', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'user-uuid-123',
          cefr_level: 'B2',
          target_language: 'en',
          native_language: 'ar',
          settings: { autoPause: true },
        },
      ],
    });

    const profile = await service.getProfile();
    expect(profile).not.toBeNull();
    expect(profile?.cefr_level).toBe('B2');
    expect(profile?.native_language).toBe('ar');
  });
});
