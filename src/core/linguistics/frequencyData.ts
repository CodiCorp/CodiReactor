// ─────────────────────────────────────────────────
// CodiReactor Ranked English Frequency Dataset
// 1000 high-frequency words grouped in 100-word rank tiers
// Parity with Language Reactor / Codi Reactor Knowledge Base
// ─────────────────────────────────────────────────

export interface RankedWord {
  word: string;
  rank: number;
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  pos: string;
  ar: string;
}

// 1. Rank 1 - 100 (Alphabetical columns matching ref/image copy 4.png)
export const RANK_1_100: string[] = [
  'a', 'about', 'all', 'also', 'and', 'as', 'at', 'back', 'be', 'because',
  'but', 'by', 'can', 'come', 'could', 'day', 'do', 'even', 'find', 'first',
  'for', 'from', 'get', 'give', 'go', 'good', 'have', 'he', 'here', 'how',
  'I', 'if', 'in', 'into', 'it', 'just', 'know', 'let', 'like', 'little',
  'look', 'make', 'more', 'my', 'need', 'no', 'not', 'now', 'of', 'oh',
  'okay', 'on', 'only', 'or', 'other', 'out', 'people', 'really', 'right', 'say',
  'see', 'she', 'should', 'so', 'some', 'something', 'take', 'tell', 'that', 'the',
  'then', 'there', 'these', 'they', 'thing', 'think', 'this', 'time', 'to', 'too',
  'up', 'use', 'very', 'want', 'way', 'we', 'well', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'work', 'would', 'yeah', 'yes', 'you'
];

// 2. Rank 101 - 200 (Matching ref/image copy 4.png)
export const RANK_101_200: string[] = [
  'actually', 'after', 'again', 'already', 'always', 'another', 'any', 'anything', 'around', 'ask',
  'away', 'before', 'best', 'better', 'big', 'bit', 'both', 'bring', 'call', 'change',
  'course', 'different', 'down', 'eat', 'end', 'every', 'everything', 'feel', 'friend', 'game',
  'great', 'guy', 'hand', 'happen', 'hear', 'help', 'hey', 'home', 'keep', 'kind',
  'last', 'laugh', 'leave', 'life', 'live', 'long', 'lot', 'love', 'man', 'many',
  'may', 'maybe', 'mean', 'might', 'money', 'most', 'move', 'much', 'music', 'must',
  'name', 'never', 'new', 'next', 'nice', 'nothing', 'off', 'open', 'over', 'own',
  'part', 'place', 'play', 'please', 'point', 'put', 'run', 'same', 'show', 'sorry',
  'start', 'still', 'stop', 'such', 'sure', 'talk', 'than', 'thank', 'those', 'through',
  'today', 'try', 'turn', 'uh', 'video', 'wait', 'watch', 'while', 'world', 'year'
];

// 3. Rank 201 - 300 (Matching ref/image copy 4.png)
export const RANK_201_300: string[] = [
  'able', 'add', 'bad', 'become', 'believe', 'between', 'body', 'break', 'business', 'buy',
  'car', 'care', 'case', 'cause', 'check', 'child', 'close', 'create', 'dad', 'die',
  'each', 'else', 'enough', 'ever', 'everyone', 'eye', 'face', 'family', 'few', 'fine',
  'follow', 'girl', 'happy', 'hard', 'head', 'hello', 'high', 'hold', 'hope', 'house',
  'idea', 'important', 'information', 'its', 'job', 'kid', 'kill', 'learn', 'line', 'lose',
  'meet', 'mind', 'minute', 'mom', 'night', 'number', 'ok', 'old', 'once', 'order',
  'pay', 'person', 'plan', 'power', 'pretty', 'probably', 'problem', 'question', 'read', 'ready',
  'real', 'remember', 'room', 'school', 'second', 'seem', 'send', 'set', 'side', 'since',
  'someone', 'sound', 'speak', 'stay', 'team', 'thanks', 'together', 'top', 'um', 'understand',
  'water', 'week', 'whole', 'win', 'without', 'woman', 'word', 'write', 'wrong', 'yourself'
];

// 4. Rank 301 - 400 (Matching ref/image copy 4.png)
export const RANK_301_400: string[] = [
  'against', 'allow', 'almost', 'answer', 'anyone', 'area', 'baby', 'base', 'beautiful', 'book',
  'boy', 'brother', 'build', 'choose', 'click', 'color', 'company', 'continue', 'control', 'cookie',
  'cool', 'country', 'cut', 'deal', 'door', 'drink', 'drive', 'during', 'easy', 'enjoy',
  'exactly', 'example', 'experience', 'fact', 'fall', 'far', 'father', 'fight', 'finish', 'food',
  'forget', 'free', 'fuck', 'full', 'fun', 'grow', 'guess', 'heart', 'hi', 'hit',
  'hour', 'include', 'inside', 'later', 'least', 'level', 'light', 'listen', 'matter', 'moment',
  'month', 'morning', 'mother', 'myself', 'offer', 'party', 'phone', 'pick', 'post', 'product',
  'provide', 'quite', 're', 'reason', 'save', 'service', 'share', 'sit', 'sleep', 'small',
  'son', 'soon', 'stand', 'step', 'story', 'stuff', 'support', 'system', 'though', 'true',
  'type', 'under', 'until', 'walk', 'wear', 'website', 'whatever', 'worry', 'wow', 'yet'
];

// 5. Rank 401 - 500
export const RANK_401_500: string[] = [
  'across', 'action', 'activity', 'actually', 'ad', 'address', 'age', 'ago', 'air', 'alone',
  'along', 'already', 'although', 'among', 'animal', 'appear', 'arm', 'art', 'article', 'attack',
  'author', 'available', 'ball', 'bank', 'bar', 'bear', 'beat', 'bed', 'behind', 'bill',
  'black', 'blood', 'blue', 'board', 'boat', 'born', 'bottom', 'box', 'break', 'brother',
  'budget', 'build', 'building', 'camera', 'campaign', 'capital', 'card', 'career', 'catch', 'center',
  'central', 'century', 'certain', 'certainly', 'chair', 'chance', 'character', 'charge', 'church', 'city',
  'claim', 'class', 'clean', 'clear', 'clearly', 'coach', 'cold', 'collection', 'college', 'common',
  'community', 'compare', 'computer', 'concern', 'condition', 'conference', 'consider', 'contain', 'continue', 'corner',
  'cost', 'court', 'cover', 'crime', 'culture', 'cup', 'current', 'customer', 'dark', 'data'
];

// 6. Rank 501 - 600
export const RANK_501_600: string[] = [
  'daughter', 'death', 'debate', 'decade', 'decide', 'decision', 'deep', 'defense', 'degree', 'democrat',
  'describe', 'design', 'despite', 'detail', 'determine', 'develop', 'development', 'device', 'differ', 'direction',
  'director', 'discover', 'discuss', 'discussion', 'disease', 'doctor', 'dog', 'draw', 'dream', 'drop',
  'drug', 'early', 'east', 'economic', 'economy', 'edge', 'education', 'effect', 'effort', 'eight',
  'either', 'election', 'employee', 'energy', 'engine', 'enter', 'entire', 'especially', 'establish', 'evening',
  'event', 'everybody', 'evidence', 'exact', 'executive', 'expect', 'expert', 'explain', 'eye', 'factor',
  'fail', 'fall', 'fast', 'fear', 'feature', 'federal', 'feeling', 'field', 'figure', 'fill',
  'film', 'final', 'finally', 'financial', 'finger', 'fire', 'firm', 'fish', 'five', 'floor',
  'fly', 'focus', 'foot', 'force', 'foreign', 'former', 'forward', 'four', 'friend', 'front'
];

// 7. Rank 601 - 700
export const RANK_601_700: string[] = [
  'future', 'garden', 'general', 'generation', 'gift', 'glass', 'goal', 'government', 'ground', 'group',
  'growth', 'guess', 'gun', 'hair', 'half', 'hall', 'hang', 'hardly', 'health', 'heavy',
  'history', 'hold', 'hospital', 'hotel', 'huge', 'human', 'hundred', 'husband', 'identify', 'image',
  'imagine', 'impact', 'improve', 'income', 'increase', 'indeed', 'indicate', 'individual', 'industry', 'instead',
  'institution', 'interest', 'interesting', 'international', 'interview', 'investment', 'involve', 'issue', 'item', 'join',
  'judge', 'jump', 'key', 'kitchen', 'knowledge', 'land', 'language', 'large', 'law', 'lawyer',
  'lay', 'lead', 'leader', 'leadership', 'leading', 'league', 'leg', 'legal', 'less', 'letter',
  'lie', 'likely', 'limit', 'list', 'local', 'loss', 'machine', 'magazine', 'main', 'maintain',
  'major', 'majority', 'manage', 'management', 'manager', 'market', 'marriage', 'material', 'maybe', 'measure'
];

// 8. Rank 701 - 800
export const RANK_701_800: string[] = [
  'media', 'medical', 'meet', 'meeting', 'member', 'memory', 'mention', 'message', 'method', 'middle',
  'military', 'million', 'mission', 'model', 'modern', 'movement', 'movie', 'national', 'natural', 'nature',
  'nearly', 'necessary', 'network', 'news', 'newspaper', 'nobody', 'none', 'nor', 'north', 'note',
  'notice', 'nuclear', 'occur', 'officer', 'official', 'often', 'oil', 'onto', 'operation', 'opportunity',
  'option', 'organization', 'original', 'outside', 'page', 'pain', 'painting', 'paper', 'parent', 'participant',
  'particular', 'particularly', 'partner', 'pass', 'past', 'patient', 'pattern', 'peace', 'performance', 'period',
  'personal', 'physical', 'picture', 'piece', 'plant', 'player', 'pm', 'police', 'policy', 'political',
  'politics', 'poor', 'popular', 'population', 'position', 'positive', 'possible', 'potential', 'practice', 'prepare',
  'present', 'president', 'pressure', 'prevent', 'price', 'private', 'probably', 'process', 'produce', 'professional'
];

// 9. Rank 801 - 900
export const RANK_801_900: string[] = [
  'professor', 'program', 'project', 'property', 'protect', 'prove', 'public', 'purpose', 'push', 'quality',
  'race', 'radio', 'raise', 'range', 'rate', 'rather', 'reach', 'reaction', 'readily', 'reality',
  'receive', 'recent', 'recently', 'recognize', 'record', 'red', 'reduce', 'reflect', 'region', 'relate',
  'relationship', 'religious', 'remain', 'remove', 'report', 'represent', 'require', 'research', 'resource', 'respond',
  'response', 'responsibility', 'rest', 'result', 'return', 'reveal', 'rich', 'ride', 'ring', 'rise',
  'risk', 'road', 'rock', 'role', 'rule', 'safe', 'safety', 'sale', 'scene', 'science',
  'scientist', 'score', 'sea', 'season', 'seat', 'section', 'security', 'seek', 'senior', 'sense',
  'series', 'serious', 'serve', 'seven', 'several', 'sex', 'sexual', 'shake', 'share', 'shoot',
  'short', 'shot', 'shoulder', 'sign', 'significant', 'similar', 'simple', 'simply', 'sing', 'single'
];

// 10. Rank 901 - 1000
export const RANK_901_1000: string[] = [
  'sister', 'site', 'situation', 'six', 'size', 'skill', 'skin', 'smile', 'social', 'society',
  'soldier', 'solution', 'somebody', 'source', 'south', 'southern', 'space', 'special', 'specific', 'speech',
  'spend', 'sport', 'spring', 'staff', 'stage', 'standard', 'statement', 'station', 'status', 'stock',
  'strategy', 'street', 'strong', 'structure', 'student', 'study', 'style', 'subject', 'success', 'successful',
  'suddenly', 'suffer', 'suggest', 'summer', 'sun', 'surface', 'table', 'task', 'tax', 'teach',
  'teacher', 'technology', 'television', 'term', 'test', 'theory', 'third', 'thousand', 'threat', 'throw',
  'thus', 'tonight', 'total', 'tough', 'toward', 'town', 'track', 'trade', 'traditional', 'training',
  'travel', 'treat', 'treatment', 'tree', 'trial', 'trip', 'trouble', 'trust', 'truth', 'unit',
  'university', 'upon', 'usually', 'value', 'various', 'victim', 'view', 'violence', 'visit', 'voice'
];

// Tier aggregation
export const ALL_RANK_TIERS = [
  { title: 'rank 1 - 100', min: 1, max: 100, words: RANK_1_100 },
  { title: 'rank 101 - 200', min: 101, max: 200, words: RANK_101_200 },
  { title: 'rank 201 - 300', min: 201, max: 300, words: RANK_201_300 },
  { title: 'rank 301 - 400', min: 301, max: 400, words: RANK_301_400 },
  { title: 'rank 401 - 500', min: 401, max: 500, words: RANK_401_500 },
  { title: 'rank 501 - 600', min: 501, max: 600, words: RANK_501_600 },
  { title: 'rank 601 - 700', min: 601, max: 700, words: RANK_601_700 },
  { title: 'rank 701 - 800', min: 701, max: 800, words: RANK_701_800 },
  { title: 'rank 801 - 900', min: 801, max: 900, words: RANK_801_900 },
  { title: 'rank 901 - 1000', min: 901, max: 1000, words: RANK_901_1000 },
];
