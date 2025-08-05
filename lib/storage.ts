import type { 
  LocalStorageData, 
  Conversation, 
  Message, 
  UserSettings, 
  SearchCache, 
  ImageCache 
} from "@/types"
import { generateId, parseJSON } from "./utils"

const STORAGE_KEYS = {
  CONVERSATIONS: 'ai_chatbot_conversations',
  SETTINGS: 'ai_chatbot_settings',
  SEARCH_CACHE: 'ai_chatbot_search_cache',
  IMAGE_CACHE: 'ai_chatbot_image_cache',
} as const

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  fontSize: 'medium',
  language: 'en',
  voiceEnabled: true,
  soundEnabled: true,
  searchEnabled: true,
  imageGenerationEnabled: true,
}

// Conversation Management
export class ConversationStorage {
  static getAll(): Conversation[] {
    if (typeof window === 'undefined') return []
    
    const stored = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS)
    if (!stored) return []
    
    try {
      const conversations = JSON.parse(stored)
      // Convert date strings back to Date objects
      return conversations.map((conv: any) => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        updatedAt: new Date(conv.updatedAt),
        messages: conv.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }))
    } catch (error) {
      console.error('Error parsing conversations:', error)
      return []
    }
  }

  static save(conversations: Conversation[]): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations))
    } catch (error) {
      console.error('Error saving conversations:', error)
      // If storage is full, remove oldest conversations
      if (error instanceof DOMException && error.code === 22) {
        this.cleanup()
        // Try again after cleanup
        try {
          localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations))
        } catch (secondError) {
          console.error('Failed to save even after cleanup:', secondError)
        }
      }
    }
  }

  static create(firstMessage: Message): Conversation {
    const conversation: Conversation = {
      id: generateId(),
      title: this.generateTitle(firstMessage.content),
      messages: [firstMessage],
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
    }

    const conversations = this.getAll()
    conversations.unshift(conversation) // Add to beginning
    this.save(conversations)
    
    return conversation
  }

  static update(conversationId: string, updates: Partial<Conversation>): Conversation | null {
    const conversations = this.getAll()
    const index = conversations.findIndex(conv => conv.id === conversationId)
    
    if (index === -1) return null

    conversations[index] = {
      ...conversations[index],
      ...updates,
      updatedAt: new Date(),
    }

    this.save(conversations)
    return conversations[index]
  }

  static addMessage(conversationId: string, message: Message): Conversation | null {
    const conversations = this.getAll()
    const conversation = conversations.find(conv => conv.id === conversationId)
    
    if (!conversation) return null

    conversation.messages.push(message)
    conversation.updatedAt = new Date()

    this.save(conversations)
    return conversation
  }

  static delete(conversationId: string): boolean {
    const conversations = this.getAll()
    const filtered = conversations.filter(conv => conv.id !== conversationId)
    
    if (filtered.length === conversations.length) return false
    
    this.save(filtered)
    return true
  }

  static deleteAll(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS)
  }

  static cleanup(): void {
    const conversations = this.getAll()
    // Keep only the 50 most recent conversations
    const trimmed = conversations.slice(0, 50)
    this.save(trimmed)
  }

  private static generateTitle(content: string): string {
    const maxLength = 50
    const cleaned = content.trim().replace(/\s+/g, ' ')
    if (cleaned.length <= maxLength) return cleaned
    return cleaned.slice(0, maxLength - 3) + '...'
  }

  static exportData(): string {
    const conversations = this.getAll()
    return JSON.stringify(conversations, null, 2)
  }

  static importData(data: string): boolean {
    try {
      const conversations = JSON.parse(data)
      if (Array.isArray(conversations)) {
        // Validate the structure
        const validConversations = conversations.filter(conv => 
          conv.id && conv.title && Array.isArray(conv.messages)
        )
        this.save(validConversations)
        return true
      }
      return false
    } catch (error) {
      console.error('Error importing conversations:', error)
      return false
    }
  }
}

// Settings Management
export class SettingsStorage {
  static get(): UserSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    if (!stored) return DEFAULT_SETTINGS
    
    return parseJSON(stored, DEFAULT_SETTINGS)
  }

  static save(settings: UserSettings): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings))
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }

  static update(updates: Partial<UserSettings>): UserSettings {
    const current = this.get()
    const updated = { ...current, ...updates }
    this.save(updated)
    return updated
  }

  static reset(): UserSettings {
    this.save(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}

// Search Cache Management
export class SearchCacheStorage {
  private static readonly MAX_CACHE_SIZE = 100
  private static readonly CACHE_EXPIRY_HOURS = 24

  static getAll(): SearchCache[] {
    if (typeof window === 'undefined') return []
    
    const stored = localStorage.getItem(STORAGE_KEYS.SEARCH_CACHE)
    if (!stored) return []
    
    try {
      const cache = JSON.parse(stored)
      return cache.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
        expiry: new Date(item.expiry)
      }))
    } catch (error) {
      console.error('Error parsing search cache:', error)
      return []
    }
  }

  static save(cache: SearchCache[]): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(STORAGE_KEYS.SEARCH_CACHE, JSON.stringify(cache))
    } catch (error) {
      console.error('Error saving search cache:', error)
    }
  }

  static add(query: string, results: any[]): void {
    const cache = this.getAll()
    const now = new Date()
    const expiry = new Date(now.getTime() + this.CACHE_EXPIRY_HOURS * 60 * 60 * 1000)

    const cacheItem: SearchCache = {
      id: generateId(),
      query,
      results,
      timestamp: now,
      expiry,
    }

    // Remove existing cache for same query
    const filtered = cache.filter(item => item.query !== query)
    
    // Add new item and limit size
    filtered.unshift(cacheItem)
    const trimmed = filtered.slice(0, this.MAX_CACHE_SIZE)
    
    this.save(trimmed)
  }

  static get(query: string): SearchCache | null {
    const cache = this.getAll()
    const item = cache.find(item => item.query === query)
    
    if (!item) return null
    
    // Check if expired
    if (new Date() > item.expiry) {
      this.remove(item.id)
      return null
    }
    
    return item
  }

  static remove(id: string): void {
    const cache = this.getAll()
    const filtered = cache.filter(item => item.id !== id)
    this.save(filtered)
  }

  static cleanup(): void {
    const cache = this.getAll()
    const now = new Date()
    const valid = cache.filter(item => now <= item.expiry)
    this.save(valid)
  }

  static clear(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.SEARCH_CACHE)
  }
}

// Image Cache Management
export class ImageCacheStorage {
  private static readonly MAX_CACHE_SIZE = 50

  static getAll(): ImageCache[] {
    if (typeof window === 'undefined') return []
    
    const stored = localStorage.getItem(STORAGE_KEYS.IMAGE_CACHE)
    if (!stored) return []
    
    try {
      const cache = JSON.parse(stored)
      return cache.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }))
    } catch (error) {
      console.error('Error parsing image cache:', error)
      return []
    }
  }

  static save(cache: ImageCache[]): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(STORAGE_KEYS.IMAGE_CACHE, JSON.stringify(cache))
    } catch (error) {
      console.error('Error saving image cache:', error)
    }
  }

  static add(prompt: string, enhancedPrompt: string, imageUrl: string): void {
    const cache = this.getAll()
    
    const cacheItem: ImageCache = {
      id: generateId(),
      prompt,
      enhancedPrompt,
      imageUrl,
      timestamp: new Date(),
    }

    // Add new item and limit size
    cache.unshift(cacheItem)
    const trimmed = cache.slice(0, this.MAX_CACHE_SIZE)
    
    this.save(trimmed)
  }

  static clear(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.IMAGE_CACHE)
  }
}

// General Storage Utilities
export class StorageUtils {
  static getStorageSize(): { used: number; available: number } {
    if (typeof window === 'undefined') return { used: 0, available: 0 }
    
    let used = 0
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length
      }
    }
    
    // Rough estimate of available space (5MB typical limit)
    const available = 5 * 1024 * 1024 - used
    
    return { used, available }
  }

  static clearAll(): void {
    ConversationStorage.deleteAll()
    SettingsStorage.reset()
    SearchCacheStorage.clear()
    ImageCacheStorage.clear()
  }

  static exportAllData(): string {
    const data = {
      conversations: ConversationStorage.getAll(),
      settings: SettingsStorage.get(),
      searchCache: SearchCacheStorage.getAll(),
      imageCache: ImageCacheStorage.getAll(),
      exportedAt: new Date().toISOString(),
    }
    
    return JSON.stringify(data, null, 2)
  }

  static importAllData(dataString: string): boolean {
    try {
      const data = JSON.parse(dataString)
      
      if (data.conversations && Array.isArray(data.conversations)) {
        ConversationStorage.save(data.conversations)
      }
      
      if (data.settings) {
        SettingsStorage.save(data.settings)
      }
      
      if (data.searchCache && Array.isArray(data.searchCache)) {
        SearchCacheStorage.save(data.searchCache)
      }
      
      if (data.imageCache && Array.isArray(data.imageCache)) {
        ImageCacheStorage.save(data.imageCache)
      }
      
      return true
    } catch (error) {
      console.error('Error importing data:', error)
      return false
    }
  }
}