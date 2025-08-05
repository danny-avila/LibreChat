import * as cheerio from "cheerio"
import type { SearchRequest, SearchResponse, SearchResult, ScrapeRequest, ScrapeResponse } from "@/types"

// Helper function to construct search URL based on search type
export function constructSearchUrl(
  query: string, 
  searchType: string = "web", 
  market: string = "en-IN", 
  safeSearch: string = "moderate", 
  first: number = 1
): string {
  if (searchType === "news") {
    // Use Google News for news search
    const params = new URLSearchParams({
      q: query,
      tbm: "nws",
      gl: "in", // India region
      hl: "en", // English language
      num: "20" // Request 20 results per page
    })
    
    if (first > 1) {
      params.set("start", ((first - 1) * 20).toString())
    }
    
    return `https://www.google.com/search?${params.toString()}`
  } else {
    // Use Bing for web search
    const params = new URLSearchParams({
      q: query,
      setmkt: market,
      safesearch: safeSearch,
      first: first.toString(),
      count: "20", // Request 20 results per page
    })

    return `https://www.bing.com/search?${params.toString()}`
  }
}

// Helper function to extract actual URL from Google redirect URL
export function extractActualUrl(redirectUrl: string): string {
  try {
    // Handle Google redirect URLs like: 
    // https://www.google.com/url?sa=t&source=web&rct=j&opi=89978449&url=https://www.ndtv.com/world-news/...&ved=...&usg=...
    const urlObj = new URL(redirectUrl)
    const actualUrl = urlObj.searchParams.get('url')
    if (actualUrl) {
      return decodeURIComponent(actualUrl)
    }
    
    // If not a Google redirect, return as is
    return redirectUrl
  } catch (error) {
    console.error("Error extracting URL:", error)
    return redirectUrl
  }
}

// Helper function to extract source name from URL
export function extractSourceName(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace('www.', '')
    
    // Extract domain name without extension
    const domainParts = hostname.split('.')
    if (domainParts.length >= 2) {
      return domainParts[0] + ' web'
    }
    
    return hostname + ' web'
  } catch (error) {
    console.error("Error extracting source name:", error)
    return 'Unknown source'
  }
}

// Extraction methods for fetching web content
export async function fetchWithStandardHeaders(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "Unknown Title"
    
    return {
      success: true,
      sourceCode: html,
      size: Buffer.byteLength(html, 'utf8').toString(),
      title,
      method: 'Standard Fetch'
    }
  } catch (error) {
    return {
      success: false,
      error: `Standard fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      method: 'Standard Fetch'
    }
  }
}

export async function fetchWithMobileHeaders(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(18000),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "Unknown Title"
    
    return {
      success: true,
      sourceCode: html,
      size: Buffer.byteLength(html, 'utf8').toString(),
      title,
      method: 'Mobile Safari'
    }
  } catch (error) {
    return {
      success: false,
      error: `Mobile fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      method: 'Mobile Safari'
    }
  }
}

export async function fetchSimple(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "Unknown Title"
    
    return {
      success: true,
      sourceCode: html,
      size: Buffer.byteLength(html, 'utf8').toString(),
      title,
      method: 'Simple Fetch'
    }
  } catch (error) {
    return {
      success: false,
      error: `Simple fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      method: 'Simple Fetch'
    }
  }
}

// Helper function to extract HTML content using multiple strategies
export async function extractHtml(url: string) {
  const methods = [
    () => fetchWithStandardHeaders(url),
    () => fetchWithMobileHeaders(url),
    () => fetchSimple(url),
  ]

  let lastError = ""

  for (const method of methods) {
    try {
      const result = await method()
      if (result.success) {
        return result
      } else {
        lastError = result.error || "Unknown error"
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error"
    }
  }

  throw new Error(`All extraction methods failed. Last error: ${lastError}`)
}

// Parse search results from HTML
export function parseSearchResults(html: string, query: string, searchType: string = "web"): SearchResponse {
  const $ = cheerio.load(html)
  const results: SearchResult[] = []
  let position = 1

  // Extract search results using selectors based on search type
  let selectors: string[] = []
  
  if (searchType === "news") {
    // Google News selectors
    selectors = [
      'div[data-ved]',     // Main Google news results with data-ved attribute
      '.g',                // Google result container
      '.Gx5Zad',           // News result container
      '.SoaBEf',           // News card
      '.xrnccd',           // News item
      '.WlydOe'            // News snippet
    ]
  } else {
    // Bing web search selectors
    selectors = [
      '.b_algo',           // Standard organic results
      'li.b_algo',         // List items with b_algo class
      '.b_algoSlug',       // Alternative result format
      'ol#b_results > li'  // Direct children of results list
    ]
  }

  // Try each selector to maximize result extraction
  selectors.forEach(selector => {
    $(selector).each((index, element) => {
      try {
        const $result = $(element)
        
        // Skip if already processed or is an ad
        if ($result.hasClass('b_ad') || $result.hasClass('b_adTop') || 
            $result.attr('data-processed') === 'true') return
        
        // Mark as processed
        $result.attr('data-processed', 'true')
        
        // Extract title and URL with different methods for news vs web
        let titleElement, title, url
        
        if (searchType === "news") {
          // Google News specific selectors
          titleElement = $result.find('a[href*="/url?"]').first()
          if (titleElement.length === 0) {
            titleElement = $result.find('h3 a').first()
          }
          if (titleElement.length === 0) {
            titleElement = $result.find('a[data-ved]').first()
          }
          
          title = titleElement.text().trim()
          url = titleElement.attr('href')
          
          // Extract actual URL from Google redirect
          if (url && url.includes('/url?')) {
            url = extractActualUrl(url)
          }
        } else {
          // Bing web search selectors
          titleElement = $result.find('h2 a').first()
          if (titleElement.length === 0) {
            titleElement = $result.find('h3 a').first()
          }
          if (titleElement.length === 0) {
            titleElement = $result.find('a[href*="http"]').first()
          }
          
          title = titleElement.text().trim()
          url = titleElement.attr('href')
          
          // Clean up URL if it's a Bing redirect
          if (url && url.includes('bing.com/ck/a')) {
            const urlMatch = url.match(/&u=([^&]+)/)
            if (urlMatch) {
              url = decodeURIComponent(urlMatch[1])
            }
          }
        }
        
        // Skip results without title or URL
        if (!title || !url) return

        // Extract description with different methods for news vs web
        let description = ""
        
        if (searchType === "news") {
          // Google News description selectors
          description = $result.find('.GI74Re').first().text().trim()
          if (!description) {
            description = $result.find('.y3G2Ed').first().text().trim()
          }
          if (!description) {
            description = $result.find('.st').first().text().trim()
          }
        } else {
          // Bing web search description selectors
          description = $result.find('.b_caption p').first().text().trim()
          if (!description) {
            description = $result.find('.b_caption').first().text().trim()
          }
          if (!description) {
            description = $result.find('.b_snippet').first().text().trim()
          }
        }
        if (!description) {
          description = $result.find('p').first().text().trim()
        }

        // Prepare base result object
        const result: any = {
          position: position++,
          title: title,
          url: url,
          displayUrl: new URL(url).hostname,
          description: description || "No description available"
        }

        // Add news-specific fields for Google News results
        if (searchType === "news") {
          // Extract source provider from URL
          result.provider = extractSourceName(url)
          
          // Try to extract published date for news
          let datePublished = $result.find('.WG9SHc .f9PG4e').first().text().trim()
          if (!datePublished) {
            datePublished = $result.find('.df3QL').first().text().trim()
          }
          if (!datePublished) {
            datePublished = $result.find('.MgUUmf').first().text().trim()
          }
          
          if (datePublished) {
            result.datePublished = datePublished
          }
          
          // Check for breaking news indicator
          const isBreaking = $result.find('.fVWD3e').length > 0 || 
                           $result.text().toLowerCase().includes('breaking') ||
                           $result.find('.kWLgee').length > 0
          
          if (isBreaking) {
            result.isBreakingNews = true
          }
        }

        results.push(result)
      } catch (error) {
        console.error("Error parsing result:", error)
      }
    })
  })

  // Extract total results count
  let totalResults = results.length
  if (searchType === "news") {
    // For Google News, try to find result count
    const resultCountText = $('#result-stats').text() || 
                           $('.LHJvCe').text() || 
                           $('.gG0TJc').text()
    if (resultCountText) {
      const match = resultCountText.match(/[\d,]+/)
      if (match) {
        totalResults = parseInt(match[0].replace(/,/g, '')) || results.length
      }
    }
  } else {
    // For Bing web search
    let totalResultsText = ''
    const resultCountElements = [
      $('.sb_count'),
      $('#b_tween .sb_count'),
      $('.b_results_count')
    ]
    
    for (const element of resultCountElements) {
      const text = element.text().trim()
      if (text && text.includes('results')) {
        totalResultsText = text
        break
      }
    }

    if (totalResultsText) {
      const match = totalResultsText.match(/[\d,]+/)
      if (match) {
        totalResults = parseInt(match[0].replace(/,/g, '')) || results.length
      }
    }
  }

  // Calculate mock search time (would be actual time in real implementation)
  const searchTime = Math.random() * 2 + 1 // 1-3 seconds

  return {
    query,
    totalResults: Math.max(totalResults, results.length),
    searchTime: Number(searchTime.toFixed(1)),
    results,
    metadata: {
      scrapingMethod: "Enhanced HTML Extractor",
      extractionTime: new Date().toISOString(),
      sourceSize: `${Math.floor(html.length / 1024)}KB`,
    },
  }
}