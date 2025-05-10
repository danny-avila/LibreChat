export type SearchProvider = 'serper' | 'searxng';
export type RerankerType = 'infinity' | 'jina' | 'cohere' | 'none';

export interface OrganicResult {
  position?: number;
  title?: string;
  link: string;
  snippet?: string;
  date?: string;
}

export interface TopStoryResult {
  title?: string;
  link: string;
  source?: string;
  date?: string;
  imageUrl?: string;
}

export interface ImageResult {
  title?: string;
  imageUrl?: string;
}

export interface KnowledgeGraphResult {
  title?: string;
  type?: string;
  description?: string;
  attributes?: Record<string, string>;
  imageUrl?: string;
}

export interface AnswerBoxResult {
  title?: string;
  answer?: string;
  snippet?: string;
  date?: string;
}

export interface PeopleAlsoAskResult {
  question?: string;
  answer?: string;
}

export interface Highlight {
  score: number;
  text: string;
}

export interface ValidSource {
  link: string;
  position?: number;
  title?: string;
  snippet?: string;
  date?: string;
  content?: string;
  attribution?: string;
  highlights?: Highlight[];
}

export interface SearchResultData {
  turn: number;
  // results
  organic?: ValidSource[];
  topStories?: ValidSource[];
  images?: ImageResult[];
  knowledgeGraph?: KnowledgeGraphResult;
  answerBox?: AnswerBoxResult;
  peopleAlsoAsk?: PeopleAlsoAskResult[];
  relatedSearches?: string[];
  suggestions?: string[];
  error?: string;
}
