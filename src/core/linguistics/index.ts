// Core linguistics barrel export
export { tokenize, isLikelyProperNoun, isNumeric, type RawToken } from './tokenizer';
export { lemmatize, loadLemmaData, getLangFamily } from './lemmatizer';
export {
  loadFrequencyData, lookupFrequency, rankToCEFR,
  calculateCoverage, getFrequencyDBSize, generateSeedFrequencyData,
} from './frequencyEngine';
export {
  enrichToken, enrichTokens, classifyToken,
  toggleWordStatus, ignoreWord, getVocabStats,
  getTokenColor, shouldOutline,
  createEmptyVocabulary, type VocabularyState,
} from './vocabularyMatrix';
