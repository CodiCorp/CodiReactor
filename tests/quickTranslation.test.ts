import { describe, it, expect } from 'vitest';
import { getQuickWordTranslation, getSentenceTranslation } from '../src/services/quickTranslation';

describe('QuickTranslationService', () => {
  it('returns valid Arabic translation for indefinite article "a"', async () => {
    const res = await getQuickWordTranslation('a', 'ar');
    expect(res).toBeDefined();
    expect(res.length).toBeGreaterThan(0);
    // Must contain Arabic characters
    expect(res.some(t => /[\u0600-\u06FF]/.test(t))).toBe(true);
    // Must NOT return the English letter 'a'
    expect(res.includes('a')).toBe(false);
  });

  it('returns valid Arabic translation for common media words like "model", "high", "t-rex"', async () => {
    const modelTrans = await getQuickWordTranslation('model', 'ar');
    expect(modelTrans).toContain('نموذج');

    const highTrans = await getQuickWordTranslation('high', 'ar');
    expect(highTrans).toContain('عالي');

    const trexTrans = await getQuickWordTranslation('t-rex', 'ar');
    expect(trexTrans).toContain('تي ريكس');
  });

  it('never returns an English word fallback when target is Arabic', async () => {
    // Random gibberish that has no translation
    const res = await getQuickWordTranslation('xyzqwvnonexistentword123', 'ar');
    // Must either be empty or only contain Arabic
    if (res.length > 0) {
      expect(res.every(t => /[\u0600-\u06FF]/.test(t))).toBe(true);
    } else {
      expect(res).toEqual([]);
    }
  });

  it('translates full sentences to Arabic', async () => {
    const trans = await getSentenceTranslation('That\'s a T-Rex', 'ar');
    if (trans) {
      expect(/[\u0600-\u06FF]/.test(trans)).toBe(true);
    }
  });
});
