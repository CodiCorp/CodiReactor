// ─────────────────────────────────────────────────
// Lemmatizer: Language-specific root word resolver
// Reduces inflected forms to dictionary lemmas
// ─────────────────────────────────────────────────

/**
 * English irregular lemma mappings for common inflections.
 * This covers the most frequent irregular verbs and nouns.
 * For comprehensive coverage, a full lookup table from Wiktionary would be loaded.
 */
const EN_IRREGULAR_MAP: Record<string, string> = {
  // Irregular verbs (past tense & past participle)
  'was': 'be', 'were': 'be', 'been': 'be', 'am': 'be', 'is': 'be', 'are': 'be',
  'had': 'have', 'has': 'have', 'having': 'have',
  'did': 'do', 'does': 'do', 'doing': 'do', 'done': 'do',
  'went': 'go', 'goes': 'go', 'going': 'go', 'gone': 'go',
  'said': 'say', 'says': 'say', 'saying': 'say',
  'got': 'get', 'gets': 'get', 'getting': 'get', 'gotten': 'get',
  'made': 'make', 'makes': 'make', 'making': 'make',
  'came': 'come', 'comes': 'come', 'coming': 'come',
  'took': 'take', 'takes': 'take', 'taking': 'take', 'taken': 'take',
  'knew': 'know', 'knows': 'know', 'knowing': 'know', 'known': 'know',
  'thought': 'think', 'thinks': 'think', 'thinking': 'think',
  'told': 'tell', 'tells': 'tell', 'telling': 'tell',
  'found': 'find', 'finds': 'find', 'finding': 'find',
  'gave': 'give', 'gives': 'give', 'giving': 'give', 'given': 'give',
  'saw': 'see', 'sees': 'see', 'seeing': 'see', 'seen': 'see',
  'ran': 'run', 'runs': 'run', 'running': 'run',
  'felt': 'feel', 'feels': 'feel', 'feeling': 'feel',
  'left': 'leave', 'leaves': 'leave', 'leaving': 'leave',
  'brought': 'bring', 'brings': 'bring', 'bringing': 'bring',
  'began': 'begin', 'begins': 'begin', 'beginning': 'begin', 'begun': 'begin',
  'kept': 'keep', 'keeps': 'keep', 'keeping': 'keep',
  'held': 'hold', 'holds': 'hold', 'holding': 'hold',
  'wrote': 'write', 'writes': 'write', 'writing': 'write', 'written': 'write',
  'stood': 'stand', 'stands': 'stand', 'standing': 'stand',
  'heard': 'hear', 'hears': 'hear', 'hearing': 'hear',
  'let': 'let', 'lets': 'let', 'letting': 'let',
  'meant': 'mean', 'means': 'mean', 'meaning': 'mean',
  'set': 'set', 'sets': 'set', 'setting': 'set',
  'met': 'meet', 'meets': 'meet', 'meeting': 'meet',
  'paid': 'pay', 'pays': 'pay', 'paying': 'pay',
  'sat': 'sit', 'sits': 'sit', 'sitting': 'sit',
  'spoke': 'speak', 'speaks': 'speak', 'speaking': 'speak', 'spoken': 'speak',
  'read': 'read', 'reads': 'read', 'reading': 'read',
  'spent': 'spend', 'spends': 'spend', 'spending': 'spend',
  'grew': 'grow', 'grows': 'grow', 'growing': 'grow', 'grown': 'grow',
  'lost': 'lose', 'loses': 'lose', 'losing': 'lose',
  'sent': 'send', 'sends': 'send', 'sending': 'send',
  'built': 'build', 'builds': 'build', 'building': 'build',
  'fell': 'fall', 'falls': 'fall', 'falling': 'fall', 'fallen': 'fall',
  'cut': 'cut', 'cuts': 'cut', 'cutting': 'cut',
  'put': 'put', 'puts': 'put', 'putting': 'put',
  'broke': 'break', 'breaks': 'break', 'breaking': 'break', 'broken': 'break',
  'drove': 'drive', 'drives': 'drive', 'driving': 'drive', 'driven': 'drive',
  'bought': 'buy', 'buys': 'buy', 'buying': 'buy',
  'wore': 'wear', 'wears': 'wear', 'wearing': 'wear', 'worn': 'wear',
  'chose': 'choose', 'chooses': 'choose', 'choosing': 'choose', 'chosen': 'choose',
  'sang': 'sing', 'sings': 'sing', 'singing': 'sing', 'sung': 'sing',
  'caught': 'catch', 'catches': 'catch', 'catching': 'catch',
  'drew': 'draw', 'draws': 'draw', 'drawing': 'draw', 'drawn': 'draw',
  'ate': 'eat', 'eats': 'eat', 'eating': 'eat', 'eaten': 'eat',
  'drank': 'drink', 'drinks': 'drink', 'drinking': 'drink', 'drunk': 'drink',
  'flew': 'fly', 'flies': 'fly', 'flying': 'fly', 'flown': 'fly',
  'forgot': 'forget', 'forgets': 'forget', 'forgetting': 'forget', 'forgotten': 'forget',
  'froze': 'freeze', 'freezes': 'freeze', 'freezing': 'freeze', 'frozen': 'freeze',
  'hid': 'hide', 'hides': 'hide', 'hiding': 'hide', 'hidden': 'hide',
  'lay': 'lie', 'lies': 'lie', 'lying': 'lie', 'lain': 'lie',
  'led': 'lead', 'leads': 'lead', 'leading': 'lead',
  'rose': 'rise', 'rises': 'rise', 'rising': 'rise', 'risen': 'rise',
  'rode': 'ride', 'rides': 'ride', 'riding': 'ride', 'ridden': 'ride',
  'shook': 'shake', 'shakes': 'shake', 'shaking': 'shake', 'shaken': 'shake',
  'shot': 'shoot', 'shoots': 'shoot', 'shooting': 'shoot',
  'slept': 'sleep', 'sleeps': 'sleep', 'sleeping': 'sleep',
  'stole': 'steal', 'steals': 'steal', 'stealing': 'steal', 'stolen': 'steal',
  'struck': 'strike', 'strikes': 'strike', 'striking': 'strike',
  'swam': 'swim', 'swims': 'swim', 'swimming': 'swim', 'swum': 'swim',
  'taught': 'teach', 'teaches': 'teach', 'teaching': 'teach',
  'threw': 'throw', 'throws': 'throw', 'throwing': 'throw', 'thrown': 'throw',
  'understood': 'understand', 'understands': 'understand', 'understanding': 'understand',
  'woke': 'wake', 'wakes': 'wake', 'waking': 'wake', 'woken': 'wake',
  'won': 'win', 'wins': 'win', 'winning': 'win',
  // Irregular nouns
  'children': 'child', 'men': 'man', 'women': 'woman', 'feet': 'foot',
  'teeth': 'tooth', 'mice': 'mouse', 'geese': 'goose', 'people': 'person',
  'lives': 'life', 'wives': 'wife', 'knives': 'knife', 'leaves': 'leaf',
  // Common contractions (already lowercased by tokenizer)
  "don't": 'do', "doesn't": 'do', "didn't": 'do',
  "can't": 'can', "couldn't": 'could', "wouldn't": 'would', "shouldn't": 'should',
  "won't": 'will', "isn't": 'be', "aren't": 'be', "wasn't": 'be', "weren't": 'be',
  "hasn't": 'have', "haven't": 'have', "hadn't": 'have',
  "i'm": 'be', "he's": 'be', "she's": 'be', "it's": 'be', "we're": 'be', "they're": 'be',
  "i've": 'have', "we've": 'have', "they've": 'have', "you've": 'have',
  "i'd": 'would', "he'd": 'would', "she'd": 'would', "we'd": 'would', "they'd": 'would',
  "i'll": 'will', "he'll": 'will', "she'll": 'will', "we'll": 'will', "they'll": 'will',
};

/**
 * English suffix stripping rules (ordered from longest to shortest).
 * Applied only if the resulting stem is ≥ 3 characters.
 */
const EN_SUFFIX_RULES: Array<{ suffix: string; replacement: string; minStem: number }> = [
  // -ies → -y (carries → carry)
  { suffix: 'ies', replacement: 'y', minStem: 1 },
  // -ied → -y (carried → carry)
  { suffix: 'ied', replacement: 'y', minStem: 1 },
  // -ness → '' (happiness → happy... but we need the y back)
  { suffix: 'iness', replacement: 'y', minStem: 2 },
  { suffix: 'ness', replacement: '', minStem: 3 },
  // -ment → '' (development → develop)
  { suffix: 'ment', replacement: '', minStem: 3 },
  // -tion / -sion → '' (information → inform... lossy but acceptable)
  { suffix: 'ation', replacement: 'ate', minStem: 2 },
  { suffix: 'tion', replacement: '', minStem: 3 },
  { suffix: 'sion', replacement: '', minStem: 3 },
  // -able / -ible → '' (readable → read)
  { suffix: 'able', replacement: '', minStem: 3 },
  { suffix: 'ible', replacement: '', minStem: 3 },
  // -ful → '' (beautiful → beauty... lossy)
  { suffix: 'ful', replacement: '', minStem: 3 },
  // -less → '' (careless → care)
  { suffix: 'less', replacement: '', minStem: 3 },
  // -ing → '' (running → run, making → make)
  { suffix: 'ting', replacement: 't', minStem: 2 },  // sitting → sit
  { suffix: 'ning', replacement: 'n', minStem: 2 },  // running → run
  { suffix: 'ding', replacement: 'd', minStem: 2 },  // adding → add
  { suffix: 'bing', replacement: 'b', minStem: 2 },  // grabbing → grab
  { suffix: 'ping', replacement: 'p', minStem: 2 },  // stopping → stop
  { suffix: 'ming', replacement: 'm', minStem: 2 },  // swimming → swim
  { suffix: 'ging', replacement: 'g', minStem: 2 },  // digging → dig
  { suffix: 'ving', replacement: 've', minStem: 2 },  // having → have
  { suffix: 'king', replacement: 'ke', minStem: 2 },  // making → make
  { suffix: 'cing', replacement: 'ce', minStem: 2 },  // dancing → dance
  { suffix: 'zing', replacement: 'ze', minStem: 2 },  // freezing → freeze
  { suffix: 'ing', replacement: '', minStem: 3 },
  // -ed → '' (walked → walk, loved → love)
  { suffix: 'tted', replacement: 't', minStem: 2 },  // fitted → fit
  { suffix: 'nned', replacement: 'n', minStem: 2 },  // planned → plan
  { suffix: 'pped', replacement: 'p', minStem: 2 },  // stopped → stop
  { suffix: 'bbed', replacement: 'b', minStem: 2 },  // grabbed → grab
  { suffix: 'dded', replacement: 'd', minStem: 2 },  // added → add
  { suffix: 'gged', replacement: 'g', minStem: 2 },  // tagged → tag
  { suffix: 'mmed', replacement: 'm', minStem: 2 },  // slammed → slam
  { suffix: 'ied', replacement: 'y', minStem: 2 },   // tried → try
  { suffix: 'ed', replacement: '', minStem: 3 },
  // -er → '' (bigger → big)
  { suffix: 'er', replacement: '', minStem: 3 },
  // -est → '' (biggest → big)
  { suffix: 'est', replacement: '', minStem: 3 },
  // -ly → '' (quickly → quick)
  { suffix: 'ly', replacement: '', minStem: 3 },
  // -s → '' (cats → cat) — LAST because it's the most common & shortest
  { suffix: 'es', replacement: '', minStem: 3 },
  { suffix: 's', replacement: '', minStem: 3 },
];

/** External lemma data loaded from JSON (populated by loadLemmaData) */
let externalLemmaMap: Record<string, string> | null = null;

/**
 * Load an external lemma map from a JSON object.
 * Expected format: { "inflection": "lemma", ... }
 */
export function loadLemmaData(data: Record<string, string>): void {
  externalLemmaMap = data;
}

/**
 * Determine the language family for lemmatization strategy selection.
 */
type LangFamily = 'english' | 'romance' | 'germanic' | 'cjk' | 'arabic' | 'other';

function getLangFamily(locale: string): LangFamily {
  const lang = locale.split('-')[0].toLowerCase();
  if (lang === 'en') return 'english';
  if (['es', 'fr', 'it', 'pt', 'ro', 'ca', 'gl'].includes(lang)) return 'romance';
  if (['de', 'nl', 'sv', 'da', 'no', 'nb', 'nn'].includes(lang)) return 'germanic';
  if (['zh', 'ja', 'ko', 'th'].includes(lang)) return 'cjk';
  if (['ar', 'fa', 'he', 'ur'].includes(lang)) return 'arabic';
  return 'other';
}

/**
 * Lemmatize a word — find its dictionary root form.
 * Strategy varies by language family.
 */
export function lemmatize(word: string, locale: string = 'en'): string {
  const lower = word.toLowerCase().trim();
  if (lower.length === 0) return lower;

  const family = getLangFamily(locale);

  switch (family) {
    case 'english':
      return lemmatizeEnglish(lower);
    case 'cjk':
      // CJK: no lemmatization — each character/morpheme is its own unit
      return lower;
    case 'arabic':
      return lemmatizeArabic(lower);
    case 'romance':
    case 'germanic':
    case 'other':
    default:
      // Attempt English-style suffix stripping as a universal fallback
      return lemmatizeBySuffix(lower);
  }
}

function lemmatizeEnglish(word: string): string {
  // 1. Check external lemma map first (if loaded)
  if (externalLemmaMap && word in externalLemmaMap) {
    return externalLemmaMap[word];
  }

  // 2. Check irregular map
  if (word in EN_IRREGULAR_MAP) {
    return EN_IRREGULAR_MAP[word];
  }

  // 3. Apply suffix rules
  return lemmatizeBySuffix(word);
}

function lemmatizeBySuffix(word: string): string {
  for (const rule of EN_SUFFIX_RULES) {
    if (word.endsWith(rule.suffix)) {
      const stem = word.slice(0, -rule.suffix.length) + rule.replacement;
      if (stem.length >= rule.minStem) {
        return stem;
      }
    }
  }
  return word;
}

/**
 * Arabic root extraction — very basic 3-letter root extractor.
 * For production, a proper Arabic morphological analyzer (e.g., Camel Tools) would be needed.
 * This serves as a reasonable fallback for frequency matching.
 */
function lemmatizeArabic(word: string): string {
  // Strip common Arabic prefixes (al-, wa-, fa-, bi-, li-, ka-)
  let stem = word;
  const prefixes = ['ال', 'وال', 'بال', 'فال', 'لل', 'و', 'ف', 'ب', 'ل', 'ك'];
  for (const prefix of prefixes) {
    if (stem.startsWith(prefix) && stem.length > prefix.length + 2) {
      stem = stem.slice(prefix.length);
      break;
    }
  }

  // Strip common suffixes
  const suffixes = ['ون', 'ين', 'ات', 'ان', 'ها', 'هم', 'هن', 'كم', 'كن', 'نا', 'ة', 'ه'];
  for (const suffix of suffixes) {
    if (stem.endsWith(suffix) && stem.length > suffix.length + 2) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }

  return stem;
}

export { EN_IRREGULAR_MAP, getLangFamily };
