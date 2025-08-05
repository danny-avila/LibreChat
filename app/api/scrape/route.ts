import { type NextRequest, NextResponse } from "next/server"
import type { ScrapeRequest, ScrapeResponse } from "@/types"
import * as cheerio from "cheerio"
import { fetchWithStandardHeaders, fetchWithMobileHeaders, fetchSimple } from "@/lib/search-utils"

export async function POST(request: NextRequest) {
  try {
    const { url }: ScrapeRequest = await request.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({
        success: false,
        error: "Valid URL is required"
      }, { status: 400 })
    }

    // Use the same fetch methods as the extractor
    const methods = [
      () => fetchWithStandardHeaders(url),
      () => fetchWithMobileHeaders(url),
      () => fetchSimple(url),
    ]

    let lastError = ""

    for (const method of methods) {
      try {
        const result = await method()
        if (result.success && result.sourceCode) {
          const $ = cheerio.load(result.sourceCode)
          
          // Remove script, style, and other non-content elements
          $('script, style, nav, header, footer, aside, .advertisement, .ads, .social-share').remove()
          
          // Try to find main content areas with more comprehensive selectors
          let content = ""
          const contentSelectors = [
            'article',
            '[role="main"]',
            'main',
            '.content',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.post-body',
            '.story-body',
            '.article-body',
            '#content',
            '.main-content',
            '.mw-parser-output', // Wikipedia specific
            '.entry',
            '.text',
            '.article-text',
            '.content-body',
            '.post-text',
            '.article-wrapper',
            '.content-wrapper'
          ]

          // Try each selector and collect all potential content
          let bestContent = ""
          let maxLength = 0
          
          for (const selector of contentSelectors) {
            const element = $(selector)
            if (element.length > 0) {
              const selectorContent = element.text().trim()
              if (selectorContent.length > maxLength) {
                maxLength = selectorContent.length
                bestContent = selectorContent
              }
            }
          }

          // Use the best content found, or fallback to body
          if (bestContent && bestContent.length > 1000) {
            content = bestContent
          } else {
            // Remove common non-content elements and extract everything
            $('script, style, nav, header, footer, aside, .sidebar, .navigation, .nav, .menu, .social, .share, .comments, .related, .ads, .advertisement, .cookie, .popup').remove()
            content = $('body').text().trim()
          }

          // Clean up the text more comprehensively
          content = content
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .replace(/\n\s*\n/g, '\n') // Remove empty lines
            .replace(/\[edit\]/g, '') // Remove Wikipedia edit links
            .replace(/\[\d+\]/g, '') // Remove reference numbers
            .trim()

          console.log(`Content extraction completed: ${content.length} characters for ${url}`)

          const response: ScrapeResponse = {
            success: true,
            data: {
              url: url,
              content: content,
              contentLength: content.length,
              extractedAt: new Date().toISOString()
            }
          }

          return NextResponse.json(response)
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        continue
      }
    }

    return NextResponse.json({
      success: false,
      error: "Failed to scrape content from URL",
      lastError
    }, { status: 500 })

  } catch (error) {
    console.error("Scraping error:", error)
    return NextResponse.json({
      success: false,
      error: "Internal server error during scraping"
    }, { status: 500 })
  }
}