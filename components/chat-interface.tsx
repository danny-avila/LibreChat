"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { 
  Send, 
  ImageIcon, 
  Bot, 
  User, 
  Download, 
  Loader2, 
  Sparkles, 
  RefreshCw,
  Search,
  Globe,
  Newspaper,
  ExternalLink,
  Copy,
  Check,
  MoreVertical,
  ChevronDown
} from "lucide-react"
import { cn, generateId, formatTimestamp, truncateText, extractDomain } from "@/lib/utils"
import type { Message, SearchData, SearchResult } from "@/types"
import { useToast } from "@/hooks/use-toast"

interface ChatInterfaceProps {
  className?: string
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! I'm your AI assistant with internet search capabilities. I can help you with text generation, create images, and search for current information from the web. What would you like to do today?",
      type: "text",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showMenu, setShowMenu] = useState(false)
  const [showSources, setShowSources] = useState<{ [key: string]: boolean }>({})
  const [selectedAction, setSelectedAction] = useState<"image" | "search" | null>(null)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      const menuContainer = target.closest('.menu-container')
      const menuButton = target.closest('[data-menu-button]')
      
      if (showMenu && !menuContainer && !menuButton) {
        setShowMenu(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showMenu) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [showMenu])

  const generateImageUrl = (prompt: string) => {
    const encodedPrompt = encodeURIComponent(prompt)
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`
  }

  const handleSearch = async (searchData: SearchData) => {
    if (!searchData.queries || searchData.queries.length === 0) {
      console.log("No search queries provided")
      return
    }

    console.log("Starting search with queries:", searchData.queries)
    setIsSearching(true)
    const searchResults: SearchResult[] = []

    try {
      for (const query of searchData.queries) {
        console.log("Searching for query:", query)
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            searchType: searchData.searchType || "web",
            limit: searchData.maxResults || 5,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          console.log("Search results received:", data.results.length, "results")
          searchResults.push(...data.results)
        } else {
          console.error("Search request failed:", response.status)
        }
      }

      setSearchResults(searchResults)
      console.log("Total search results:", searchResults.length)

      // If scraping is required, handle it
      if (searchData.requiresScraping && searchData.targetUrl) {
        console.log("Scraping required for URL:", searchData.targetUrl)
        const scrapeResponse = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: searchData.targetUrl }),
        })

        if (scrapeResponse.ok) {
          const scrapeData = await scrapeResponse.json()
          if (scrapeData.success && scrapeData.data) {
            // Add scraped content to the first search result
            if (searchResults.length > 0) {
              searchResults[0].scrapedContent = scrapeData.data.content
              console.log("Scraped content added to first result")
            }
          }
        }
      }

      // Send search results back to AI for analysis
      console.log("Sending search results to AI for analysis")
      const analysisResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are analyzing search results. Provide a comprehensive response based on the search results provided. Be informative and helpful.",
            },
            {
              role: "user",
              content: `Please analyze these search results and provide a comprehensive response: ${JSON.stringify(searchResults)}`,
            },
          ],
        }),
      })

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json()
        console.log("AI analysis completed")
        
        // Update the last message with the analysis
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          if (lastMessage && lastMessage.role === "assistant") {
            lastMessage.content = analysisData.content
            lastMessage.searchData = {
              ...searchData,
              searchResults,
              searchTime: searchResults.length > 0 ? 2.5 : 0, // Mock search time
            }
          }
          return newMessages
        })
      }
    } catch (error) {
      console.error("Search error:", error)
      toast({
        title: "Search Error",
        description: "Failed to perform search. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleImageGeneration = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: prompt,
      type: "image",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // Add loading message
    const loadingMessage: Message = {
      id: generateId(),
      role: "assistant",
      content: "Creating your image...",
      type: "image",
      timestamp: new Date(),
      isGenerating: true,
    }

    setMessages((prev) => [...prev, loadingMessage])

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Remove loading message and add actual response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingMessage.id)
        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: "Here's your generated image:",
          type: "image",
          imageUrl: data.enhancedPrompt ? generateImageUrl(data.enhancedPrompt) : undefined,
          enhancedPrompt: data.enhancedPrompt,
          timestamp: new Date(),
        }
        return [...filtered, assistantMessage]
      })
      
      // Reset selected action after successful completion
      setSelectedAction(null)
    } catch (error: any) {
      console.error("Error:", error)

      // Remove loading message and add error message
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingMessage.id)

        let errorContent = "I'm experiencing some technical difficulties with image generation. Please try again."

        if (error.message.includes("Failed to fetch")) {
          errorContent = "Network connection issue. Please check your internet and try again."
        } else if (error.message.includes("timeout")) {
          errorContent = "The image generation request timed out. Please try again with a shorter prompt."
        } else if (error.message.includes("429")) {
          errorContent = "Too many image generation requests. Please wait a moment and try again."
        }

        return [
          ...filtered,
          {
            id: generateId(),
            role: "assistant",
            content: errorContent,
            type: "text",
            timestamp: new Date(),
          },
        ]
      })
      
      // Reset selected action on error
      setSelectedAction(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchRequest = async (query: string) => {
    if (!query.trim() || isLoading) return

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: query,
      type: "search",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // Add loading message
    const loadingMessage: Message = {
      id: generateId(),
      role: "assistant",
      content: "Searching for information...",
      type: "search",
      timestamp: new Date(),
      isGenerating: true,
    }

    setMessages((prev) => [...prev, loadingMessage])

    try {
      // Create a search request that the AI will process
      const searchData: SearchData = {
        requiresSearch: true,
        searchType: "web",
        queries: [query],
        maxResults: 5,
        requiresScraping: false,
      }

      // Send to chat API with search context
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant. When the user requests a search, you must respond with a JSON object in this exact format: { \"requiresSearch\": true, \"searchType\": \"web\", \"queries\": [\"search query\"], \"maxResults\": 5, \"requiresScraping\": false }",
            },
            {
              role: "user",
              content: `Please search for: ${query}`,
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Remove loading message and add actual response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingMessage.id)
        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: data.content || "Search completed",
          type: "search",
          timestamp: new Date(),
          searchData: searchData,
        }
        return [...filtered, assistantMessage]
      })

      // Perform the search
      await handleSearch(searchData)
      
      // Reset selected action after successful completion
      setSelectedAction(null)
    } catch (error: any) {
      console.error("Error:", error)

      // Remove loading message and add error message
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingMessage.id)

        let errorContent = "I'm experiencing some technical difficulties with search. Please try again."

        if (error.message.includes("Failed to fetch")) {
          errorContent = "Network connection issue. Please check your internet and try again."
        } else if (error.message.includes("timeout")) {
          errorContent = "The search request timed out. Please try again."
        } else if (error.message.includes("429")) {
          errorContent = "Too many search requests. Please wait a moment and try again."
        }

        return [
          ...filtered,
          {
            id: generateId(),
            role: "assistant",
            content: errorContent,
            type: "text",
            timestamp: new Date(),
          },
        ]
      })
      
      // Reset selected action on error
      setSelectedAction(null)
    } finally {
      setIsLoading(false)
    }
  }

  const downloadImage = (imageUrl: string, prompt: string) => {
    try {
      const link = document.createElement("a")
      link.href = imageUrl
      link.download = `generated-image-${prompt.slice(0, 20).replace(/[^a-zA-Z0-9]/g, "_")}.jpg`
      link.target = "_blank"
      link.click()
    } catch (error) {
      console.error("Download failed:", error)
      window.open(imageUrl, "_blank")
    }
  }

  const regenerateImage = (prompt: string, messageId: string) => {
    const newImageUrl = generateImageUrl(prompt)
    setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, imageUrl: newImageUrl } : msg)))
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied!",
        description: "Text copied to clipboard",
      })
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case "image":
        return <ImageIcon className="w-4 h-4" />
      case "search":
        return <Search className="w-4 h-4" />
      default:
        return <Bot className="w-4 h-4" />
    }
  }

  const getModeColor = (mode: string) => {
    switch (mode) {
      case "image":
        return "bg-purple-100 text-purple-800 border-purple-200"
      case "search":
        return "bg-blue-100 text-blue-800 border-blue-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    } catch {
      return `https://www.google.com/s2/favicons?domain=example.com&sz=32`
    }
  }

  const getSelectedActionIcon = () => {
    switch (selectedAction) {
      case "image":
        return <ImageIcon className="w-4 h-4" />
      case "search":
        return <Search className="w-4 h-4" />
      default:
        return <MoreVertical className="w-4 h-4" />
    }
  }

  const getSelectedActionColor = () => {
    switch (selectedAction) {
      case "image":
        return "text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100"
      case "search":
        return "text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100"
      default:
        return "text-gray-600 bg-white hover:bg-gray-50"
    }
  }

  const handleMenuToggle = () => {
    if (selectedAction) {
      setSelectedAction(null)
    } else {
      setShowMenu(!showMenu)
    }
  }

  const handleImageAction = () => {
    setSelectedAction("image")
    setShowMenu(false)
  }

  const handleSearchAction = () => {
    setSelectedAction("search")
    setShowMenu(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // If a specific action is selected, trigger it directly
    if (selectedAction === "image") {
      handleImageGeneration(input)
      return
    } else if (selectedAction === "search") {
      handleSearchRequest(input)
      return
    }

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: input,
      type: "text",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // Add loading message
    const loadingMessage: Message = {
      id: generateId(),
      role: "assistant",
      content: "Thinking...",
      type: "text",
      timestamp: new Date(),
      isGenerating: true,
    }

    setMessages((prev) => [...prev, loadingMessage])

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant powered by Pollinations.AI with internet search capabilities.",
            },
            ...messages, 
            userMessage
          ].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      // Remove loading message and add actual response
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingMessage.id)
        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: data.content || "Response generated successfully",
          type: data.imageData ? "image" : "text",
          imageUrl: data.imageData?.imageUrl,
          enhancedPrompt: data.imageData?.enhancedPrompt,
          timestamp: new Date(),
          searchData: data.searchData,
        }
        return [...filtered, assistantMessage]
      })

      // Handle search if required - this should happen automatically
      if (data.searchData && data.searchData.requiresSearch) {
        console.log("Auto-triggering search based on AI response")
        await handleSearch(data.searchData)
      }
    } catch (error: any) {
      console.error("Error:", error)

      // Remove loading message and add error message
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== loadingMessage.id)

        let errorContent = "I'm experiencing some technical difficulties. Please try again."

        if (error.message.includes("Failed to fetch")) {
          errorContent = "Network connection issue. Please check your internet and try again."
        } else if (error.message.includes("timeout")) {
          errorContent = "The request timed out. Please try again with a shorter message."
        } else if (error.message.includes("429")) {
          errorContent = "Too many requests. Please wait a moment and try again."
        }

        return [
          ...filtered,
          {
            id: generateId(),
            role: "assistant",
            content: errorContent,
            type: "text",
            timestamp: new Date(),
          },
        ]
      })
    } finally {
      setIsLoading(false)
    }
  }

  const SearchResults = ({ results, messageId }: { results: SearchResult[], messageId: string }) => (
    <div className="space-y-3 mt-4">
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Search className="w-4 h-4" />
        <span>Search Results ({results.length})</span>
      </div>
      
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSources(prev => ({ ...prev, [messageId]: !prev[messageId] }))}
          className="flex items-center space-x-2 w-full justify-between bg-white hover:bg-gray-50 border-gray-300 shadow-sm"
        >
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <span className="font-medium">View Sources</span>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
              {results.length}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showSources[messageId] ? 'rotate-180' : ''}`} />
        </Button>
        
        {showSources[messageId] && (
          <div className="mt-3 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Search Sources</span>
                </h3>
                <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded-full border">
                  {results.length} results
                </span>
              </div>
            </div>
            
            <div className="max-h-80 overflow-y-auto">
              {results.map((result, index) => (
                <div key={index} className="group border-b border-gray-100 last:border-b-0">
                  <div className="p-4 hover:bg-gray-50 transition-colors duration-200">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center border">
                          <img 
                            src={getFaviconUrl(result.url)} 
                            alt="website favicon" 
                            className="w-5 h-5 rounded"
                            onLoad={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'block'
                            }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              const fallback = document.createElement('div')
                              fallback.className = 'w-5 h-5 rounded bg-gray-300 flex items-center justify-center'
                              fallback.innerHTML = '<svg class="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM4.5 9.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z"/></svg>'
                              target.parentNode?.insertBefore(fallback, target)
                            }}
                            style={{ display: 'none' }}
                          />
                          <div className="w-4 h-4 text-gray-400">
                            <svg fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM4.5 9.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                              <a href={result.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {result.title}
                              </a>
                            </h4>
                            <p className="text-xs text-gray-500 mt-1 font-mono">{result.displayUrl}</p>
                            <p className="text-xs text-gray-600 mt-2 line-clamp-2 leading-relaxed">{result.description}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(result.url, "_blank")}
                            className="ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Click on any result to visit the source website
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className={cn("flex flex-col h-screen bg-gradient-to-br from-blue-50 to-purple-50", className)}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Chatbot with Search</h1>
              <p className="text-sm text-gray-500">Intelligent conversations with internet access</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <Card
                className={cn(
                  "max-w-[80%] p-4 transition-all duration-200 hover:shadow-md",
                  message.role === "user" ? "bg-blue-500 text-white" : "bg-white border border-gray-200"
                )}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      message.role === "user" ? "bg-blue-600" : "bg-gray-100"
                    )}
                  >
                    {message.role === "user" ? <User className="w-4 h-4 text-white" /> : getModeIcon(message.type)}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className={getModeColor(message.type)}>
                        {message.type}
                      </Badge>
                      <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                      {message.role === "assistant" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(message.content)}
                          className="h-6 w-6 p-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm leading-relaxed">{message.content}</p>

                      {message.isGenerating && (
                        <div className="flex items-center space-x-2 text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Generating...</span>
                        </div>
                      )}

                      {isSearching && message.searchData && (
                        <div className="flex items-center space-x-2 text-blue-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Searching the web...</span>
                        </div>
                      )}

                      {message.searchData?.searchResults && (
                        <SearchResults results={message.searchData.searchResults} messageId={message.id} />
                      )}

                      {message.imageUrl && (
                        <div className="space-y-2">
                          <img
                            src={message.imageUrl}
                            alt="Generated image"
                            className="rounded-lg max-w-full h-auto shadow-md"
                            onError={(e) => {
                              console.log("Image failed to load, regenerating...")
                              const target = e.target as HTMLImageElement
                              if (message.enhancedPrompt) {
                                target.src = generateImageUrl(message.enhancedPrompt)
                              }
                            }}
                          />
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                downloadImage(message.imageUrl!, message.enhancedPrompt || message.content)
                              }
                              className="flex items-center space-x-1"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </Button>
                            {message.enhancedPrompt && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => regenerateImage(message.enhancedPrompt!, message.id)}
                                className="flex items-center space-x-1"
                              >
                                <RefreshCw className="w-4 h-4" />
                                <span>Regenerate</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input Form */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Selection Indicator */}
          {selectedAction && (
            <div className="mb-3 animate-in slide-in-from-top-2 duration-300">
              <div className={`inline-flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium ${
                selectedAction === "image" 
                  ? "bg-purple-100 text-purple-800 border border-purple-200" 
                  : "bg-blue-100 text-blue-800 border border-blue-200"
              }`}>
                {selectedAction === "image" ? (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    <span>Image Creation Mode</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Search Mode</span>
                  </>
                )}
                <button
                  onClick={() => setSelectedAction(null)}
                  className="ml-2 hover:opacity-70 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <div className="relative flex-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  selectedAction === "image" 
                    ? "Describe the image you want to create..."
                    : selectedAction === "search"
                      ? "What would you like to search for?"
                      : "Type your message, ask for current information, or describe an image to create..."
                }
                className="pr-12"
                disabled={isLoading}
              />
              
              {/* Menu Button */}
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 menu-container">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMenuToggle}
                  className={`h-8 w-8 p-0 border ${getSelectedActionColor()}`}
                  data-menu-button
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : getSelectedActionIcon()}
                </Button>
                
                {/* Menu Dropdown */}
                {showMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 min-w-56 menu-container">
                    <div className="p-3">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Quick Actions</h3>
                        <p className="text-xs text-gray-500">Select a mode, then enter your prompt</p>
                      </div>
                      
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handleImageAction}
                          disabled={isLoading}
                          className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-purple-50 hover:border-purple-200 border border-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center transition-all duration-200 group-hover:bg-purple-200">
                            <ImageIcon className="w-4 h-4 text-purple-600" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-medium text-sm text-gray-900">Create Image</div>
                            <div className="text-xs text-gray-500">Generate an image from your description</div>
                          </div>
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleSearchAction}
                          disabled={isLoading}
                          className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center transition-all duration-200 group-hover:bg-blue-200">
                            <Search className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-medium text-sm text-gray-900">Search Web</div>
                            <div className="text-xs text-gray-500">Search for current information</div>
                          </div>
                        </button>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 text-center">
                          Select a mode to get started, then type your prompt
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}