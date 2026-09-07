export {
  editDistance,
  fuzzyThreshold,
  isFuzzyMatch,
  isTokenMatch,
  queryTerms,
  similarity,
  STOPWORDS,
} from "./fuzzy";
export { LexicalScorer, type RelevanceScorer } from "./scoring";
export {
  buildIndex,
  MAX_INDEXED_CONTENT_CHARS,
  type FileEntry,
  type IndexedEntity,
  type ModuleEntry,
  type SummaryEntry,
  type SymbolEntry,
} from "./search-index";
export { SearchService, type SearchServiceOptions } from "./search.service";
