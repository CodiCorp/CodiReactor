// ─────────────────────────────────────────────────
// Quick Translation & Hover Lexicon Service
// Provides sub-100ms word & sentence translations
// with local cache and offline vocabulary support
// ─────────────────────────────────────────────────

export interface QuickTranslationResult {
  word: string;
  translations: string[];
  sentenceTranslation?: string;
  collocation?: { text: string; translation: string };
  cefrLevel?: string;
}

// In-memory LRU cache to ensure instant hover response
const translationCache = new Map<string, string[]>();
const sentenceCache = new Map<string, string>();

// Seed dictionary for top English-to-Arabic high-frequency words for instantaneous offline hover
const SEED_EN_AR: Record<string, string[]> = {
  listening: ['استمع', 'يستمع', 'الاستماع'],
  listen: ['استمع', 'ينصت', 'استماع'],
  chance: ['فرصة', 'احتمال', 'حظ'],
  practice: ['ممارسة', 'تدريب', 'تمرين'],
  understand: ['يفهم', 'يستوعب', 'إدراك'],
  understanding: ['فهم', 'استيعاب', 'تفاهم'],
  real: ['حقيقي', 'واقعي', 'فعلي'],
  world: ['عالم', 'الدنيا', 'الكون'],
  spoken: ['منطوق', 'شفهي', 'محكي'],
  video: ['فيديو', 'مقطع مرئي', 'تسجيل'],
  conversation: ['محادثة', 'حوار', 'نقاش'],
  topic: ['موضوع', 'مسألة', 'فكرة'],
  skills: ['مهارات', 'قدرات', 'كفاءات'],
  skill: ['مهارة', 'براعة', 'حرفة'],
  language: ['لغة', 'لسان', 'كلام'],
  learn: ['يتعلم', 'يكتسب', 'دراسة'],
  learning: ['تعلم', 'اكتساب', 'دراسة'],
  today: ['اليوم', 'هذا اليوم'],
  welcome: ['أهلاً وسهلاً', 'مرحباً', 'ترحيب'],
  have: ['يمتلك', 'لديه', 'عنده'],
  going: ['ذاهب', 'سوف', 'مستعد'],
  talk: ['يتحدث', 'يتكلم', 'حديث'],
  variety: ['تنوع', 'تشكيلة', 'مجموعة'],
  different: ['مختلف', 'متنوع', 'متباين'],
  requested: ['مطلوب', 'مرغوب', 'ملتمس'],
  request: ['طلب', 'رجاء', 'التماس'],
  idea: ['فكرة', 'رأي', 'خاطرة'],
  honestly: ['بصراحة', 'بصدق', 'بأمانة'],
  exposure: ['تعرض', 'اطلاع', 'مخالطة'],
  improve: ['يتحسن', 'يطور', 'يرتقي'],
  better: ['أفضل', 'أحسن'],
  faster: ['أسرع', 'بشكل أسرع'],
  myself: ['نفسي', 'ذاتي'],
  normally: ['عادة', 'بشكل طبيعي'],
  channel: ['قناة'],
  grammar: ['قواعد', 'نحو'],
  vocabulary: ['مفردات', 'حصيلة لغوية'],
  pronunciation: ['نطق', 'تلفظ'],
  curious: ['فضولي', 'شغوف بالمعرفة'],
  background: ['خلفية', 'نشأة'],
  teaching: ['تدريس', 'تعليم'],
  thought: ['فكرة', 'اعتقد'],
  opportunity: ['فرصة', 'سانحة'],
  share: ['مشاركة', 'يشارك'],
};

// Seed collocations
const SEED_COLLOCATIONS: Record<string, { text: string; translation: string }> = {
  chance: { text: 'have a chance', translation: 'لدي فرصة' },
  listening: { text: 'listening skills', translation: 'مهارات الاستماع' },
  conversation: { text: 'have a conversation', translation: 'إجراء محادثة' },
  practice: { text: 'practice listening', translation: 'ممارسة الاستماع' },
  exposure: { text: 'get exposure to', translation: 'الاحتكاك باللغة' },
};

/**
 * Translate a single word into the target native language (default: Arabic).
 */
export async function getQuickWordTranslation(
  word: string,
  targetLang: string = 'ar',
): Promise<string[]> {
  const clean = word.toLowerCase().trim().replace(/^[^\w]+|[^\w]+$/g, '');
  if (!clean) return [];

  // Check cache
  const cacheKey = `${clean}_${targetLang}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // Check seed dictionary for instant response
  if (targetLang === 'ar' && SEED_EN_AR[clean]) {
    const res = SEED_EN_AR[clean];
    translationCache.set(cacheKey, res);
    return res;
  }

  // Fetch online from MyMemory API with timeout
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|${targetLang}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (resp.ok) {
      const data = await resp.json();
      const list: string[] = [];
      if (data?.responseData?.translatedText) {
        list.push(data.responseData.translatedText);
      }
      if (Array.isArray(data?.matches)) {
        for (const m of data.matches.slice(0, 4)) {
          const t = m.translation?.trim();
          if (t && !list.includes(t) && t !== clean && t.length < 35) {
            list.push(t);
          }
        }
      }
      if (list.length > 0) {
        translationCache.set(cacheKey, list);
        return list;
      }
    }
  } catch {
    // Graceful fallback
  }

  // Fallback to title case of word
  return [clean];
}

/**
 * Translate a full sentence cue into the native language.
 */
export async function getSentenceTranslation(
  sentence: string,
  targetLang: string = 'ar',
): Promise<string> {
  const clean = sentence.trim();
  if (!clean) return '';

  const cacheKey = `${clean}_${targetLang}`;
  if (sentenceCache.has(cacheKey)) {
    return sentenceCache.get(cacheKey)!;
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|${targetLang}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (resp.ok) {
      const data = await resp.json();
      const translated = data?.responseData?.translatedText?.trim();
      if (translated && translated !== clean) {
        sentenceCache.set(cacheKey, translated);
        return translated;
      }
    }
  } catch {
    // Network fallback
  }

  return '';
}

/**
 * Get collocation for a word if available.
 */
export function getCollocation(word: string): { text: string; translation: string } | null {
  const clean = word.toLowerCase().trim().replace(/^[^\w]+|[^\w]+$/g, '');
  return SEED_COLLOCATIONS[clean] || null;
}
