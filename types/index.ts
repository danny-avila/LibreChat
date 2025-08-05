export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  type: "text" | "image" | "audio" | "search"
  imageUrl?: string
  audioUrl?: string
  timestamp: Date
  isGenerating?: boolean
  enhancedPrompt?: string
  searchData?: SearchData
}

export interface SearchData {
  requiresSearch: boolean
  searchType?: "web" | "news" | "general"
  queries?: string[]
  maxResults?: number
  requiresScraping?: boolean
  targetUrl?: string
  searchResults?: SearchResult[]
  searchTime?: number
}

export interface SearchResult {
  position: number
  title: string
  url: string
  displayUrl: string
  description: string
  provider?: string
  datePublished?: string
  isBreakingNews?: boolean
  scrapedContent?: string
}

export interface SearchResponse {
  query: string
  totalResults: number
  searchTime: number
  results: SearchResult[]
  metadata: {
    scrapingMethod: string
    extractionTime: string
    sourceSize: string
    pagesScraped?: number
    market?: string
  }
}

export interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
  searchContext?: {
    previousSearches: SearchResponse[]
    currentQuery?: string
  }
}

export interface ChatResponse {
  content: string
  searchData?: SearchData
  imageData?: {
    enhancedPrompt: string
    imageUrl: string
  }
  error?: boolean
}

export interface SearchRequest {
  query: string
  limit?: number
  market?: string
  safeSearch?: "strict" | "moderate" | "off"
  searchType?: "web" | "news"
}

export interface ScrapeRequest {
  url: string
}

export interface ScrapeResponse {
  success: boolean
  data?: {
    url: string
    content: string
    contentLength: number
    extractedAt: string
  }
  error?: string
}

export interface ImageGenerationRequest {
  prompt: string
}

export interface ImageGenerationResponse {
  enhancedPrompt: string
  imageUrl: string
}

export interface LocalStorageData {
  conversations: Conversation[]
  settings: UserSettings
  cache: {
    searchResults: SearchCache[]
    imageCache: ImageCache[]
  }
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  tags: string[]
}

export interface UserSettings {
  theme: "light" | "dark" | "system"
  fontSize: "small" | "medium" | "large"
  language: string
  voiceEnabled: boolean
  soundEnabled: boolean
  searchEnabled: boolean
  imageGenerationEnabled: boolean
}

export interface SearchCache {
  id: string
  query: string
  results: SearchResult[]
  timestamp: Date
  expiry: Date
}

export interface ImageCache {
  id: string
  prompt: string
  enhancedPrompt: string
  imageUrl: string
  timestamp: Date
}

export interface VoiceSettings {
  speechRate: number
  speechPitch: number
  speechVolume: number
  voice?: SpeechSynthesisVoice
  autoPlay: boolean
}

export interface FileUpload {
  id: string
  name: string
  type: string
  size: number
  url: string
  uploadedAt: Date
}

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: "default" | "destructive" | "success" | "warning"
  duration?: number
}