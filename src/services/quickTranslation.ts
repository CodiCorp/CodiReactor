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
  // Common determiners & pronouns
  a: ['أداة تنكير', 'واحد', 'أي'],
  an: ['أداة تنكير', 'واحد'],
  the: ['الـ', 'أداة تعريف'],
  that: ['ذلك', 'تلك', 'أن'],
  "that's": ['ذلك هو', 'هذا'],
  this: ['هذا', 'هذه'],
  it: ['هو', 'هي', 'ذلك'],
  is: ['يكون', 'هو', 'هي'],
  are: ['يكونون', 'هم', 'نكون'],
  am: ['أكون', 'أنا'],
  was: ['كان', 'كانت'],
  were: ['كانوا', 'كنا'],
  be: ['يكون', 'كن'],
  been: ['كان', 'موجوداً'],
  i: ['أنا'],
  "i'm": ['أنا', 'أنا أكون'],
  you: ['أنت', 'أنتم', 'أنتِ'],
  we: ['نحن'],
  they: ['هم', 'هن'],
  he: ['هو'],
  she: ['هي'],
  my: ['لي', 'خاصتي'],
  your: ['لك', 'خاصتك'],
  his: ['له'],
  her: ['لها'],
  their: ['لهم'],
  our: ['لنا'],

  // Question words & conjunctions
  what: ['ماذا', 'ما', 'ما الذي'],
  why: ['لماذا', 'لِمَ'],
  how: ['كيف', 'بأي طريقة'],
  where: ['أين', 'حيث'],
  when: ['متى', 'عندما'],
  who: ['من', 'الذي'],
  which: ['أي', 'أيهما', 'التي'],
  and: ['و', 'مع'],
  or: ['أو', 'أم'],
  but: ['لكن', 'ولكن'],
  so: ['لذا', 'لذلك', 'جداً'],
  for: ['لأجل', 'من أجل', 'لمدة'],
  with: ['مع', 'بواسطة', 'برفقة'],
  on: ['على', 'فوق', 'في'],
  in: ['في', 'داخل'],
  at: ['في', 'عند'],
  to: ['إلى', 'أن'],
  from: ['من', 'عن'],
  by: ['بواسطة', 'بجانب', 'قبل'],
  about: ['عن', 'حول', 'تقريباً'],

  // Video and stream vocabulary
  high: ['مرتفع', 'عالي', 'في حالة نشوة'],
  like: ['يعجب', 'يحب', 'مثل'],
  god: ['الله', 'إله'],
  oh: ['أوه', 'يا'],
  model: ['نموذج', 'طراز', 'موديل'],
  brought: ['جلب', 'أحضر', 'قُدّم'],
  live: ['مباشر', 'حي', 'يعيش'],
  special: ['خاص', 'مميز', 'استثنائي'],
  emergency: ['طوارئ', 'حالة طارئة'],
  announcement: ['إعلان', 'بيان رسمى'],
  stream: ['بث مباشر', 'تيار', 'تدفق'],
  team: ['فريق', 'طاقم'],
  released: ['أطلق', 'أصدر', 'نشر'],
  release: ['إطلاق', 'إصدار', 'تحرير'],
  fable: ['أسطورة', 'خرافة'],
  killer: ['قاتل', 'مدمر', 'كاسح'],
  internet: ['الإنترنت', 'الشبكة العالمية'],
  absolute: ['مطلق', 'كامل', 'تام'],
  uproar: ['ضجة', 'صخب', 'هياج'],
  creature: ['مخلوق', 'كائن حي'],
  supposed: ['من المفترض', 'مفترض'],
  score: ['سجل', 'درجة', 'نتيجة'],
  benchmark: ['معيار', 'مقياس الأداء'],
  well: ['جيداً', 'بشكل جيد', 'حسناً'],
  rex: ['ريكس', 'ملك'],
  "t-rex": ['تي ريكس', 'تيرانوصور'],
  did: ['فعل', 'قام بـ'],
  make: ['يجعل', 'يصنع', 'يقوم بـ'],

  // Learning and general conversation
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
 * Check if a string contains Arabic characters.
 */
function containsArabic(str: string): boolean {
  return /[\u0600-\u06FF]/.test(str);
}

/**
 * Translate a single word into the target native language (default: Arabic).
 */
export async function getQuickWordTranslation(
  word: string,
  targetLang: string = 'ar',
): Promise<string[]> {
  const clean = word.toLowerCase().trim().replace(/^[^\w']+|[^\w']+$/g, '');
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

  const results: string[] = [];

  // Strategy 1: Google Translate GTX endpoint (ultra-fast, highly reliable)
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const resp = await fetch(gtxUrl, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        for (const item of data[0]) {
          const trans = item?.[0]?.trim();
          if (trans && trans.toLowerCase() !== clean) {
            if (targetLang !== 'ar' || containsArabic(trans)) {
              if (!results.includes(trans)) results.push(trans);
            }
          }
        }
      }
    }
  } catch {
    // Fall through to MyMemory
  }

  // Strategy 2: MyMemory API backup
  if (results.length < 2) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|${targetLang}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        const data = await resp.json();
        const mainTrans = data?.responseData?.translatedText?.trim();
        if (mainTrans && mainTrans.toLowerCase() !== clean) {
          if (targetLang !== 'ar' || containsArabic(mainTrans)) {
            if (!results.includes(mainTrans)) results.push(mainTrans);
          }
        }
        if (Array.isArray(data?.matches)) {
          for (const m of data.matches.slice(0, 3)) {
            const t = m.translation?.trim();
            if (t && !results.includes(t) && t.toLowerCase() !== clean && t.length < 35) {
              if (targetLang !== 'ar' || containsArabic(t)) {
                results.push(t);
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  if (results.length > 0) {
    translationCache.set(cacheKey, results);
    return results;
  }

  // For Arabic, NEVER return English fallback words! Return empty so we don't display English in Arabic tooltips.
  if (targetLang === 'ar') {
    return [];
  }

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

  // Strategy 1: Google Translate GTX endpoint (ultra-fast sentence translation)
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(clean)}`;
    const resp = await fetch(gtxUrl, { signal: AbortSignal.timeout(2500) });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map((item: any) => item?.[0] || '').join('').trim();
        if (translated && translated.toLowerCase() !== clean.toLowerCase()) {
          if (targetLang !== 'ar' || containsArabic(translated)) {
            sentenceCache.set(cacheKey, translated);
            return translated;
          }
        }
      }
    }
  } catch {
    // Fall through to MyMemory
  }

  // Strategy 2: MyMemory API backup
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|${targetLang}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (resp.ok) {
      const data = await resp.json();
      const translated = data?.responseData?.translatedText?.trim();
      if (translated && translated.toLowerCase() !== clean.toLowerCase()) {
        if (targetLang !== 'ar' || containsArabic(translated)) {
          sentenceCache.set(cacheKey, translated);
          return translated;
        }
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
