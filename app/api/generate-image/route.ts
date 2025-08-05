import { type NextRequest, NextResponse } from "next/server"
import type { ImageGenerationRequest, ImageGenerationResponse } from "@/types"

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
    const { prompt }: ImageGenerationRequest = await request.json()

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    console.log("Making image generation request with prompt:", prompt)

    // First, enhance the prompt using AI
    const enhancementResponse = await fetchWithRetry("https://text.pollinations.ai/openai", {
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
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
        private: true,
      }),
    })

    const enhancementData = await enhancementResponse.json()

    if (!enhancementData.choices || !enhancementData.choices[0] || !enhancementData.choices[0].message) {
      console.error("Invalid enhancement API response structure:", enhancementData)
      return NextResponse.json({
        error: "Failed to enhance prompt",
      }, { status: 500 })
    }

    const enhancedPrompt = enhancementData.choices[0].message.content || prompt

    console.log("Enhanced prompt:", enhancedPrompt)

    // Generate image URL using Pollinations
    const encodedPrompt = encodeURIComponent(enhancedPrompt)
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`

    const response: ImageGenerationResponse = {
      enhancedPrompt,
      imageUrl,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Image generation error:", error)

    // Provide more specific error messages
    let errorMessage = "I'm experiencing some technical difficulties with image generation. Please try again."

    if (error.name === "AbortError") {
      errorMessage = "The image generation request timed out. Please try again with a shorter prompt."
    } else if (error.message.includes("429")) {
      errorMessage = "I'm receiving too many image generation requests right now. Please wait a moment and try again."
    } else if (error.message.includes("500")) {
      errorMessage = "The image generation service is temporarily unavailable. Please try again in a few moments."
    } else if (error.message.includes("Failed to fetch")) {
      errorMessage = "Network connection issue. Please check your internet connection and try again."
    }

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 200 }, // Return 200 to avoid frontend errors
    )
  }
}