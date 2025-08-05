import { type NextRequest, NextResponse } from "next/server"
import type { ChatRequest, ChatResponse, SearchData } from "@/types"

const API_TOKEN = "bKQd-OREFd3DMl_7" // Pollination AI token
const MAX_RETRIES = 3
const TIMEOUT_MS = 30000 // 30 seconds

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return response
      }

      // If it's a rate limit error (429), wait longer before retry
      if (response.status === 429 && i < retries) {
        console.log(`Rate limited, waiting before retry ${i + 1}/${retries}`)
        await new Promise((resolve) => setTimeout(resolve, (i + 1) * 2000))
        continue
      }

      // If it's a server error (5xx), retry
      if (response.status >= 500 && i < retries) {
        console.log(`Server error ${response.status}, retrying ${i + 1}/${retries}`)
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
        continue
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (error: any) {
      console.log(`Attempt ${i + 1} failed:`, error.message)

      if (i === retries) {
        throw error
      }

      // Wait before retry, with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)))
    }
  }

  throw new Error("Max retries exceeded")
}

export async function POST(request: NextRequest) {
  try {
    const { messages, searchContext }: ChatRequest = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 })
    }

    console.log("Making chat request with", messages.length, "messages")

    // Enhanced system prompt with improved search and image generation capabilities
    const systemPrompt = `You are a helpful AI assistant powered by Pollinations.AI with internet search capabilities. You can help with various tasks including answering questions, providing information, creating images, and having conversations.

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:

1. IMAGE GENERATION: When a user asks to create an image, draw a picture, generate an image, or describes something visual they want to see, you should automatically understand they want an image created. In these cases, respond with a JSON object in this exact format:

{
  "requiresImage": true,
  "prompt": "detailed description of the image to create"
}

2. SEARCH FUNCTIONALITY: When you need current information, recent news, or up-to-date data that you don't have, you MUST automatically perform a search. NEVER say "I'll need to search" or "Give me a moment" - instead, immediately respond with a JSON object in this exact format:

{
  "requiresSearch": true,
  "searchType": "web|news|general",
  "queries": ["primary search query", "secondary search query if needed"],
  "maxResults": 5,
  "requiresScraping": false,
  "targetUrl": null
}

3. AUTOMATIC SEARCH DETECTION: You MUST automatically detect when search is needed for:
- Current events, news, or recent developments
- Latest technology updates or product releases
- Current weather, stock prices, or live data
- Recent sports results or entertainment news
- Up-to-date information about companies, people, or events
- Any information that might be outdated or that you're unsure about
- Questions about "what happened today", "latest news", "current events"
- Any time you don't have recent information

4. NO DELAYS: Never say "I'll search" or "Give me a moment" - just include the JSON immediately.

5. FALSE INFORMATION: If you don't have enough information to provide an accurate answer, DO NOT make up information. Instead, automatically use web search to find current, accurate information.

Examples of when to automatically search:
- "What happened in India today?" → Include search JSON immediately
- "Latest news about AI" → Include search JSON immediately
- "Current weather in New York" → Include search JSON immediately
- "Recent sports results" → Include search JSON immediately

Examples of when to create images:
- User asks to "create an image of..."
- User asks to "draw a picture of..."
- User asks to "generate an image of..."
- User describes something visual they want to see

Be friendly, informative, and concise in your responses. If you don't need current information or image generation, respond normally without any JSON format.`

    const response = await fetchWithRetry("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
        "User-Agent": "Pollinations-Chatbot/1.0",
      },
      body: JSON.stringify({
        model: "openai",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages.slice(-10), // Limit to last 10 messages to avoid token limits
        ],
        temperature: 0.7,
        max_tokens: 1000,
        private: true,
      }),
    })

    const data = await response.json()
    console.log("Chat API response received")

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error("Invalid API response structure:", data)
      return NextResponse.json({
        content: "I apologize, but I received an unexpected response format. Please try again.",
      })
    }

    const content = data.choices[0].message.content || "I apologize, but I couldn't generate a response."

    // Check if the response contains a search request JSON
    let searchData: SearchData | undefined
    let imageData: { requiresImage: boolean; prompt: string } | undefined
    
    try {
      // Look for search JSON in the response
      const searchJsonMatch = content.match(/\{[\s\S]*"requiresSearch"[\s\S]*\}/)
      if (searchJsonMatch) {
        const parsed = JSON.parse(searchJsonMatch[0])
        if (parsed.requiresSearch === true) {
          searchData = parsed
          console.log("Search request detected:", searchData)
        }
      }

      // Look for image generation JSON in the response
      const imageJsonMatch = content.match(/\{[\s\S]*"requiresImage"[\s\S]*\}/)
      if (imageJsonMatch) {
        const parsed = JSON.parse(imageJsonMatch[0])
        if (parsed.requiresImage === true) {
          imageData = parsed
          console.log("Image generation request detected:", imageData)
        }
      }
    } catch (error) {
      console.log("No valid JSON found in response")
    }

    // If image generation is requested, call the image generation API
    if (imageData) {
      try {
        const imageResponse = await fetchWithRetry("https://text.pollinations.ai/openai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_TOKEN}`,
            "User-Agent": "Pollinations-Chatbot/1.0",
          },
          body: JSON.stringify({
            model: "openai",
            messages: [
              {
                role: "system",
                content: `You are an expert at creating detailed, high-quality image prompts. Your task is to enhance user prompts to create better images. 

Rules:
1. Add artistic style descriptors (e.g., "digital art", "photorealistic", "oil painting", "watercolor")
2. Add lighting and mood descriptors (e.g., "dramatic lighting", "soft natural light", "golden hour")
3. Add composition descriptors (e.g., "wide shot", "close-up", "aerial view")
4. Add quality descriptors (e.g., "high quality", "detailed", "4k", "professional photography")
5. Keep the original intent but make it more specific and visually appealing
6. Return ONLY the enhanced prompt, nothing else

Example:
Input: "a cat"
Output: "A majestic cat with fluffy fur, sitting regally, soft natural lighting, detailed digital art, high quality, 4k"

Input: "sunset over mountains"
Output: "Breathtaking sunset over snow-capped mountains, golden hour lighting, dramatic clouds, wide landscape shot, professional photography, high quality, 4k"`,
              },
              {
                role: "user",
                content: imageData.prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 200,
            private: true,
          }),
        })

        const enhancementData = await imageResponse.json()

        if (enhancementData.choices && enhancementData.choices[0] && enhancementData.choices[0].message) {
          const enhancedPrompt = enhancementData.choices[0].message.content || imageData.prompt
          
          // Generate image URL using Pollinations
          const encodedPrompt = encodeURIComponent(enhancedPrompt)
          const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`

          const responseData: ChatResponse = {
            content: content.replace(/\{[\s\S]*"requiresImage"[\s\S]*\}/, '').trim(),
            imageData: {
              enhancedPrompt,
              imageUrl,
            },
          }

          return NextResponse.json(responseData)
        }
      } catch (error) {
        console.error("Image generation error:", error)
      }
    }

    const responseData: ChatResponse = {
      content: content.replace(/\{[\s\S]*"requiresSearch"[\s\S]*\}/, '').replace(/\{[\s\S]*"requiresImage"[\s\S]*\}/, '').trim(),
      searchData,
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error("Chat API error:", error)

    // Provide more specific error messages
    let errorMessage = "I'm experiencing some technical difficulties. Please try again."

    if (error.name === "AbortError") {
      errorMessage = "The request timed out. Please try again with a shorter message."
    } else if (error.message.includes("429")) {
      errorMessage = "I'm receiving too many requests right now. Please wait a moment and try again."
    } else if (error.message.includes("500")) {
      errorMessage = "The AI service is temporarily unavailable. Please try again in a few moments."
    } else if (error.message.includes("Failed to fetch")) {
      errorMessage = "Network connection issue. Please check your internet connection and try again."
    }

    return NextResponse.json(
      {
        content: errorMessage,
        error: true,
      },
      { status: 200 }, // Return 200 to avoid frontend errors
    )
  }
}